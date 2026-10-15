import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNodePlatform } from '@rivus/agent-kit/node';
import { PlatformService } from '@rivus/agent-kit/platform/effect';
import {
  createLeaseManager,
  fileLeaseRepository,
  LeaseRepository,
  type Holder,
  type LeaseSnapshot,
} from '@rivus/agent-kit-collab/lease';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { OrchestrationConflictError } from '../../src/orchestration/errors';
import {
  fileTaskLeaseRepository,
  occupyTaskLease,
  taskOrchestrationKey,
  TaskLeaseConfigError,
  TaskLeaseLostError,
  TaskLeaseStoreError,
} from '../../src/orchestration/lease';
import { TaskOccupancyService } from '../../src/task-manager/task-occupancy-service';

const KEY = taskOrchestrationKey('T-1');
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atl-lease-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirs.length = 0;
});

const platform = createNodePlatform({ env: {}, home: '/nonexistent-home' });

function selfHolder(): Holder {
  const { host, bootId, pid, startTime } = platform.process.self;
  return { host, bootId, pid, startTime };
}

/** This process's pid with another start time: what the holder of a crashed process that pid reused looks like. */
function crashedHolder(): Holder {
  return { ...selfHolder(), startTime: selfHolder().startTime - 1 };
}

/** The record file names the kit's file repository derives from the key. */
function recordPath(dir: string, key: string, suffix: string): string {
  return path.join(dir, `${encodeURIComponent(key).replace(/\./g, '%2E')}.lease${suffix}`);
}

/** Reads the stored lease record through the repository, like another process would. */
async function readRecord(dir: string, key: string): Promise<LeaseSnapshot | undefined> {
  return Effect.runPromise(
    Effect.provide(LeaseRepository, fileTaskLeaseRepository(dir)).pipe(Effect.flatMap((store) => store.load(key))),
  ) as Promise<LeaseSnapshot | undefined>;
}

/**
 * Another process takes the lease over by writing straight into the repository, as its own manager would. The
 * holder's heartbeat may write between the read and the write, so it retries, like a manager's acquisition.
 */
async function takeOver(dir: string, key: string, holder: Holder, holderId = 'successor'): Promise<LeaseSnapshot> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* LeaseRepository;
      for (let turn = 0; turn < 10; turn += 1) {
        const current = yield* store.load(key);
        const next: LeaseSnapshot = {
          key,
          generation: (current?.generation ?? 0) + 1,
          revision: (current?.revision ?? 0) + 1,
          holder,
          holderId,
          renewedAt: 0,
        };
        const written = yield* Effect.exit(store.save(key, next, current?.revision));
        if (Exit.isSuccess(written)) {
          return next;
        }
      }
      return yield* Effect.die(new Error('the record kept changing'));
    }).pipe(Effect.provide(fileTaskLeaseRepository(dir))),
  ) as Promise<LeaseSnapshot>;
}

/** Waits until the repository shows a live holder, so a second contender can race for the key. */
async function waitForHolder(dir: string, key: string): Promise<LeaseSnapshot> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const record = await readRecord(dir, key);
    if (record?.holder !== null && record !== undefined) {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`nobody acquired ${key}`);
}

describe('TaskOccupancyService on /lease', () => {
  it('runs the workflow with a mutation fence and releases the lease afterwards', async () => {
    const dir = tempDir();
    const service = new TaskOccupancyService({ repository: fileTaskLeaseRepository(dir) });

    const result = await service.run({ taskId: 'T-1', goal: 'ship it' }, async ({ signal, mutationFence }) => {
      expect(signal.aborted).toBe(false);
      const written = await mutationFence.run(async () => 'state written');
      return `ok: ${written}`;
    });

    expect(result).toBe('ok: state written');
    // The release wrote a tombstone and kept the generation: the next acquire continues the sequence.
    const record = await readRecord(dir, KEY);
    expect(record).toMatchObject({ generation: 1, holder: null, holderId: null });
    const again = await occupyTaskLease({ key: KEY, repository: fileTaskLeaseRepository(dir) });
    expect(again.generation).toBe(2);
    await again.release();
  });

  it('renews the lease with compare-and-swap while the workflow runs', async () => {
    const dir = tempDir();
    const service = new TaskOccupancyService({ repository: fileTaskLeaseRepository(dir), heartbeatMs: 20 });

    const result = await service.run({ taskId: 'T-1' }, async ({ signal }) => {
      await waitForHolder(dir, KEY);
      const first = await readRecord(dir, KEY);
      await new Promise((resolve) => setTimeout(resolve, 70));
      const second = await readRecord(dir, KEY);
      expect(second?.revision ?? 0).toBeGreaterThan(first?.revision ?? 0);
      expect(second?.generation).toBe(first?.generation);
      signal.throwIfAborted();
      return 'held';
    });

    expect(result).toBe('held');
  });

  it('refuses a second concurrent run of the same Task while the first keeps renewing', async () => {
    const dir = tempDir();
    const service = new TaskOccupancyService({ repository: fileTaskLeaseRepository(dir), heartbeatMs: 20 });
    let finishFirst: () => void = () => undefined;
    const first = service.run({ taskId: 'T-1' }, () => new Promise<void>((resolve) => (finishFirst = resolve)));
    await waitForHolder(dir, KEY);

    await expect(service.run({ taskId: 'T-1' }, async () => 'never')).rejects.toThrow(
      `Task T-1 already has an active orchestration (pid ${process.pid})`,
    );
    finishFirst();
    await first;
  });

  it('aborts the workflow and fails the run when the lease is lost', async () => {
    const dir = tempDir();
    const service = new TaskOccupancyService({ repository: fileTaskLeaseRepository(dir), heartbeatMs: 20 });
    let observedSignal: AbortSignal | undefined;
    const run = service.run({ taskId: 'T-1' }, ({ signal }) => {
      observedSignal = signal;
      return new Promise<never>(() => undefined);
    });
    await waitForHolder(dir, KEY);
    await takeOver(dir, KEY, crashedHolder());

    await expect(run).rejects.toBeInstanceOf(TaskLeaseLostError);
    expect(observedSignal?.aborted).toBe(true);
    // The successor's record survived the old holder's exit.
    expect(await readRecord(dir, KEY)).toMatchObject({ holderId: 'successor' });
  });

  it('keeps occupancy releasable when the workflow throws', async () => {
    const dir = tempDir();
    const service = new TaskOccupancyService({ repository: fileTaskLeaseRepository(dir) });

    await expect(
      service.run({ taskId: 'T-1' }, async () => {
        throw new Error('runner exploded');
      }),
    ).rejects.toThrow('runner exploded');

    const again = await occupyTaskLease({ key: KEY, repository: fileTaskLeaseRepository(dir) });
    expect(again.generation).toBe(2);
    await again.release();
  });
});

describe('occupyTaskLease race behavior on /lease', () => {
  it('serializes fenced writes per key across a takeover, and lets the old write finish under the fence', async () => {
    const dir = tempDir();
    const repository = fileTaskLeaseRepository(dir);
    const a = await occupyTaskLease({ key: KEY, ttlMs: 200, heartbeatMs: 20, repository });

    const order: string[] = [];
    let finishOld: () => void = () => undefined;
    const oldWrite = a.runFenced(async () => {
      order.push('old:start');
      await new Promise<void>((resolve) => (finishOld = resolve));
      order.push('old:end');
    });
    await vi.waitFor(() => expect(order).toEqual(['old:start']));

    await takeOver(dir, KEY, crashedHolder());
    await expect(a.lost).resolves.toBeInstanceOf(TaskLeaseLostError);

    const b = await occupyTaskLease({ key: KEY, ttlMs: 200, heartbeatMs: 20, repository });
    expect(b.generation).toBeGreaterThan(a.generation);
    const newWrite = b.runFenced(async () => order.push('new'));
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(order).toEqual(['old:start']);

    finishOld();
    await expect(oldWrite).rejects.toBeInstanceOf(TaskLeaseLostError);
    await newWrite;
    expect(order).toEqual(['old:start', 'old:end', 'new']);
    await b.release();
  });

  it('refuses a stale holder before a fenced write starts', async () => {
    const dir = tempDir();
    const repository = fileTaskLeaseRepository(dir);
    const a = await occupyTaskLease({ key: KEY, ttlMs: 200, heartbeatMs: 20, repository });
    await takeOver(dir, KEY, crashedHolder());
    await expect(a.lost).resolves.toBeInstanceOf(TaskLeaseLostError);

    const mutation = vi.fn(async () => 'never');
    await expect(a.runFenced(mutation)).rejects.toBeInstanceOf(TaskLeaseLostError);
    expect(mutation).not.toHaveBeenCalled();
    await a.release();
  });

  it('refuses a second acquire while the holder keeps renewing, and takes over a silent holder after the TTL', async () => {
    const dir = tempDir();
    const repository = fileTaskLeaseRepository(dir);
    // A holder elsewhere crashed after taking the lease: the record is fresh to a first observer.
    await takeOver(dir, KEY, selfHolder(), 'silent');

    await expect(occupyTaskLease({ key: KEY, ttlMs: 150, heartbeatMs: 30, repository })).rejects.toBeInstanceOf(
      OrchestrationConflictError,
    );

    // One waiting manager keeps its observation across retries, so a record that stays unchanged for the TTL
    // goes stale and the silent holder loses the key.
    const generation = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const manager = yield* createLeaseManager({ ttlMs: 150, heartbeatMs: 30, retryMs: 20 });
          const handle = yield* manager.acquire(KEY, { wait: true });
          return handle.token.generation;
        }),
      ).pipe(Effect.provide(repository)),
    );
    expect(generation).toBeGreaterThan(1);
  });

  it('releases only its own lease', async () => {
    const dir = tempDir();
    const repository = fileTaskLeaseRepository(dir);
    const a = await occupyTaskLease({ key: KEY, ttlMs: 200, heartbeatMs: 20, repository });
    await takeOver(dir, KEY, crashedHolder());
    await expect(a.lost).resolves.toBeInstanceOf(TaskLeaseLostError);

    await a.release();
    expect(await readRecord(dir, KEY)).toMatchObject({ holderId: 'successor' });
  });
});

describe('file lease repository recovery on /lease', () => {
  /** The lock-file fallback (no SQLite): the only mechanism whose guard files a crashed process leaves behind. */
  const fileLockRepository = (dir: string) =>
    fileLeaseRepository({ dir }).pipe(
      Layer.provideMerge(Layer.succeed(PlatformService, { ...platform, sqlite: undefined })),
    );

  it('reclaims a guard a crashed process left behind', async () => {
    const dir = tempDir();
    const stamp = { ...crashedHolder(), acquiredAt: 0, nonce: 'crashed' };
    writeFileSync(recordPath(dir, KEY, '.guard'), JSON.stringify(stamp), 'utf8');

    const handle = await occupyTaskLease({ key: KEY, repository: fileLockRepository(dir) });
    expect(handle.generation).toBe(1);
    await handle.release();
  });

  it('refuses an unreadable record instead of stealing the key, and leaves the file as it is', async () => {
    const dir = tempDir();
    writeFileSync(recordPath(dir, KEY, '.json'), '{', 'utf8');

    await expect(occupyTaskLease({ key: KEY, repository: fileTaskLeaseRepository(dir) })).rejects.toBeInstanceOf(
      TaskLeaseStoreError,
    );
    expect(readFileSync(recordPath(dir, KEY, '.json'), 'utf8')).toBe('{');
  });

  it('keeps the generation monotonic across release, re-acquisition and reopening the store', async () => {
    const dir = tempDir();
    const acquireOnce = async () => {
      const handle = await occupyTaskLease({ key: KEY, repository: fileTaskLeaseRepository(dir) });
      const generation = handle.generation;
      await handle.release();
      return generation;
    };

    expect(await acquireOnce()).toBe(1);
    expect((await readRecord(dir, KEY))?.holder).toBeNull();
    expect(await acquireOnce()).toBe(2);
    // A fresh repository over the same directory (the next process) continues the sequence.
    expect(await acquireOnce()).toBe(3);
  });

  it('validates the lease configuration before taking a key', async () => {
    const dir = tempDir();
    // One heartbeat must fit twice into the TTL.
    await expect(
      occupyTaskLease({ key: KEY, ttlMs: 100, heartbeatMs: 60, repository: fileTaskLeaseRepository(dir) }),
    ).rejects.toThrow(TaskLeaseConfigError);
    expect(await readRecord(dir, KEY)).toBeUndefined();
  });
});

describe('task lease key', () => {
  it('keeps the task:<id> key name', () => {
    expect(taskOrchestrationKey('WEB-001')).toBe('task:WEB-001');
  });
});

describe('kit lease manager smoke on /lease', () => {
  it('reads a held lease through a second manager', async () => {
    const dir = tempDir();
    const repository = fileTaskLeaseRepository(dir);
    const handle = await occupyTaskLease({ key: KEY, repository });

    const read = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const manager = yield* createLeaseManager({ ttlMs: 60_000, heartbeatMs: 15_000 });
          return yield* manager.read(KEY);
        }),
        repository,
      ),
    );
    expect(read).toMatchObject({ key: KEY, generation: handle.generation });
    expect(read?.holder?.pid).toBe(process.pid);
    await handle.release();
  });
});
