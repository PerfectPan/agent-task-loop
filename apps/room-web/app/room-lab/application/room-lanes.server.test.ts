import { describe, expect, it } from 'vite-plus/test';
import type { ActivationExit, Lanes } from '@rivus/agent-kit-collab/lanes';
import { createLanes } from '@rivus/agent-kit-collab/lanes';
import { make as makeManagedRuntime } from 'effect/ManagedRuntime';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Scope from 'effect/Scope';

/**
 * The scheduling half the rooms run on, over `createLanes`: these tests pin
 * the five behaviors the adoption guide asks this endpoint to prove — the
 * global concurrency ceiling, wake coalescing, one queue entry per key,
 * cancel/close cleanup, and the timeout reported through `onExit`.
 *
 * An activation waits on a per-key gate, so the test decides when it ends;
 * `flush` lets the forked activations reach their gates.
 */

interface Recorder {
  readonly log: string[];
  readonly exits: ActivationExit<unknown>[];
  activate(key: string): Effect.Effect<void, never, Scope.Scope>;
  onExit(exit: ActivationExit<unknown>): Effect.Effect<void>;
  open(key: string): Effect.Effect<void>;
  starts(key: string): number;
  running(): number;
}

function recorder(): Recorder {
  const log: string[] = [];
  const exits: ActivationExit<unknown>[] = [];
  const gates = new Map<string, Deferred.Deferred<void>>();
  const active = new Set<string>();
  return {
    log,
    exits,
    activate: (key) =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        gates.set(key, gate);
        log.push(`start ${key}`);
        // The finalizer yields first, like closing a process would.
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            active.delete(key);
            log.push(`end ${key}`);
          }),
        );
        active.add(key);
        yield* Deferred.await(gate);
      }),
    onExit: (exit) =>
      Effect.sync(() => {
        exits.push(exit);
      }),
    open: (key) => {
      const gate = gates.get(key);
      return gate === undefined ? Effect.die(new Error(`${key} never started`)) : Deferred.succeed(gate, undefined);
    },
    starts: (key) => log.filter((entry) => entry === `start ${key}`).length,
    running: () => active.size,
  };
}

/** Lets the forked activations run until each waits on its gate. */
const flush = Effect.forEach(Array.from({ length: 50 }), () => Effect.yieldNowWith(), { discard: true });

const until = (check: () => boolean) =>
  Effect.gen(function* () {
    for (let turn = 0; turn < 2_000 && !check(); turn += 1) {
      yield* Effect.yieldNowWith();
    }
    expect(check()).toBe(true);
  });

function makeLanes(config: Parameters<typeof createLanes>[0]): {
  rt: ReturnType<typeof makeManagedRuntime<never, never>>;
  lanes: Effect.Effect<Lanes, never, never>;
} {
  const rt = makeManagedRuntime<never, never>(Layer.mergeAll(Layer.empty));
  return {
    rt,
    lanes: Effect.provideService(createLanes(config), Scope.Scope, Scope.makeUnsafe()) as Effect.Effect<
      Lanes,
      never,
      never
    >,
  };
}

describe('room lanes over createLanes', () => {
  it('never runs more than maxConcurrent activations across every key', () =>
    Effect.gen(function* () {
      const probe = recorder();
      const { rt, lanes } = makeLanes({ maxConcurrent: 2, activate: probe.activate, onExit: probe.onExit });
      const live = yield* lanes;
      try {
        for (const key of ['a', 'b', 'c', 'd']) {
          yield* live.wake(`room:r1:member:${key}`);
        }
        yield* flush;
        // Two run; the other two wait.
        yield* until(() => probe.running() === 2);
        expect(probe.log.filter((entry) => entry.startsWith('start'))).toHaveLength(2);
        expect(probe.running()).toBe(2);

        // Opening one frees a slot for the next queued key.
        yield* probe.open('room:r1:member:a');
        yield* until(() => probe.starts('room:r1:member:c') === 1);
        yield* probe.open('room:r1:member:b');
        yield* probe.open('room:r1:member:c');
        yield* until(() => probe.starts('room:r1:member:d') === 1);
        yield* probe.open('room:r1:member:d');
        yield* until(() => probe.exits.length === 4);
        expect(probe.log.filter((entry) => entry.startsWith('start'))).toHaveLength(4);
      } finally {
        yield* live.close;
        yield* Effect.promise(() => rt.dispose());
      }
    }).pipe(Effect.runPromise));

  it('coalesces wakes that arrive while a lane runs or waits into one more activation', () =>
    Effect.gen(function* () {
      const probe = recorder();
      const { rt, lanes } = makeLanes({ maxConcurrent: 1, activate: probe.activate, onExit: probe.onExit });
      const live = yield* lanes;
      try {
        expect(yield* live.wake('room:r1:member:claude')).toBe('started');
        yield* flush;
        yield* until(() => probe.running() === 1);
        // Three wakes during the run collapse into one pending activation.
        for (let wake = 0; wake < 3; wake += 1) {
          expect(yield* live.wake('room:r1:member:claude')).toBe('coalesced');
        }
        yield* probe.open('room:r1:member:claude');
        yield* until(() => probe.starts('room:r1:member:claude') === 2);
        yield* probe.open('room:r1:member:claude');
        yield* until(() => probe.exits.length === 2);
        expect(probe.starts('room:r1:member:claude')).toBe(2);
      } finally {
        yield* live.close;
        yield* Effect.promise(() => rt.dispose());
      }
    }).pipe(Effect.runPromise));

  it('keeps at most one queued entry per key, however often it is woken', () =>
    Effect.gen(function* () {
      const probe = recorder();
      const { rt, lanes } = makeLanes({ maxConcurrent: 1, activate: probe.activate, onExit: probe.onExit });
      const live = yield* lanes;
      try {
        expect(yield* live.wake('room:r1:member:claude')).toBe('started');
        yield* flush;
        yield* until(() => probe.running() === 1);
        expect(yield* live.wake('room:r1:member:codex')).toBe('queued');
        // Waking the queued key again coalesces instead of duplicating the entry.
        expect(yield* live.wake('room:r1:member:codex')).toBe('coalesced');
        expect(yield* live.wake('room:r1:member:codex')).toBe('coalesced');
        const status = yield* live.status;
        expect(status.running).toBe(1);
        expect(status.queued).toBe(1);
        expect(status.lanes.map((lane) => lane.key)).toEqual(['room:r1:member:claude', 'room:r1:member:codex']);

        yield* probe.open('room:r1:member:claude');
        yield* until(() => probe.starts('room:r1:member:codex') === 1);
        yield* probe.open('room:r1:member:codex');
        yield* until(() => probe.exits.length === 2);
      } finally {
        yield* live.close;
        yield* Effect.promise(() => rt.dispose());
      }
    }).pipe(Effect.runPromise));

  it('cancel drops the pending wakes, interrupts the running activation and waits for its cleanup', () =>
    Effect.gen(function* () {
      const probe = recorder();
      const { rt, lanes } = makeLanes({ maxConcurrent: 1, activate: probe.activate, onExit: probe.onExit });
      const live = yield* lanes;
      try {
        expect(yield* live.wake('room:r1:member:claude')).toBe('started');
        yield* flush;
        yield* until(() => probe.running() === 1);
        expect(yield* live.wake('room:r1:member:claude')).toBe('coalesced');

        yield* live.cancel('room:r1:member:claude');
        // cancel returns only after the activation, its finalizer and onExit
        // have ended.
        expect(probe.exits).toHaveLength(1);
        expect(probe.exits[0]).toMatchObject({
          _tag: 'ActivationInterrupted',
          key: 'room:r1:member:claude',
          reason: 'cancel',
        });
        expect(probe.log).toContain('end room:r1:member:claude');
        expect(probe.running()).toBe(0);

        // A wake after the cancel is served as usual.
        expect(yield* live.wake('room:r1:member:claude')).toBe('started');
        yield* flush;
        yield* until(() => probe.running() === 1);
        yield* probe.open('room:r1:member:claude');
        yield* until(() => probe.exits.length === 2);
      } finally {
        yield* live.close;
        yield* Effect.promise(() => rt.dispose());
      }
    }).pipe(Effect.runPromise));

  it('close refuses later wakes, interrupts every running activation and waits for them all', () =>
    Effect.gen(function* () {
      const probe = recorder();
      const { rt, lanes } = makeLanes({ maxConcurrent: 2, activate: probe.activate, onExit: probe.onExit });
      const live = yield* lanes;
      yield* live.wake('room:r1:member:claude');
      yield* live.wake('room:r1:member:codex');
      yield* flush;
      yield* until(() => probe.running() === 2);

      yield* live.close;
      expect(probe.exits).toHaveLength(2);
      for (const exit of probe.exits) {
        expect(exit).toMatchObject({ _tag: 'ActivationInterrupted', reason: 'close' });
      }
      expect(probe.log.filter((entry) => entry === 'end room:r1:member:claude')).toHaveLength(1);
      expect(probe.log.filter((entry) => entry === 'end room:r1:member:codex')).toHaveLength(1);

      const refused = yield* live.wake('room:r1:member:claude').pipe(Effect.flip);
      expect(refused).toMatchObject({ _tag: 'LanesClosed', key: 'room:r1:member:claude' });
      yield* Effect.promise(() => rt.dispose());
    }).pipe(Effect.runPromise));

  it('reports a turn that outlives its timeout as ActivationInterrupted("timeout") through onExit', () =>
    Effect.gen(function* () {
      const probe = recorder();
      const { rt, lanes } = makeLanes({
        maxConcurrent: 1,
        turnTimeoutMs: 80,
        activate: probe.activate,
        onExit: probe.onExit,
      });
      const live = yield* lanes;
      try {
        expect(yield* live.wake('room:r1:member:claude')).toBe('started');
        yield* flush;
        yield* until(() => probe.running() === 1);
        yield* Effect.sleep(200);
        yield* until(() => probe.exits.length === 1);
        expect(probe.exits[0]).toMatchObject({
          _tag: 'ActivationInterrupted',
          key: 'room:r1:member:claude',
          reason: 'timeout',
        });
        expect(probe.running()).toBe(0);
      } finally {
        yield* live.close;
        yield* Effect.promise(() => rt.dispose());
      }
    }).pipe(Effect.runPromise));
});
