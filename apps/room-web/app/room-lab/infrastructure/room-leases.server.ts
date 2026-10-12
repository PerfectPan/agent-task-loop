import type {
  LeaseHandle,
  LeaseLost,
  LeaseManager,
  LeaseRepository,
  LeaseRepositoryFailure,
  LeaseSnapshot,
} from '@rivus/agent-kit-collab/lease';
import type { PlatformService } from '@rivus/agent-kit/platform/effect';
import type { ManagedRuntime } from 'effect/ManagedRuntime';
import * as Effect from 'effect/Effect';
import type { RoomLeases } from '../application/ports';
import { toLeaseError } from './room-lease.server';

/**
 * The `RoomLeases` port over the kit's lease manager: a turn's fenced writes
 * run on the lease its own activation holds, so a write lands only while that
 * activation is still the holder, and a successor's write starts only after
 * the previous one settled. The activation admits its handle when it acquires
 * the lease and withdraws it in its finalizer, so the port never serves a
 * lease the activation has already ended.
 */
export class ActiveRoomLeases implements RoomLeases {
  private readonly handles = new Map<string, LeaseHandle>();

  constructor(
    private readonly rt: ManagedRuntime<PlatformService | LeaseRepository, LeaseRepositoryFailure>,
    private readonly manager: LeaseManager,
  ) {}

  /** The activation registers the lease it just acquired. */
  admit(key: string, handle: LeaseHandle): void {
    this.handles.set(key, handle);
  }

  /** The activation's finalizer withdraws it; the next activation admits its own. */
  withdraw(key: string): void {
    this.handles.delete(key);
  }

  async fence<T>(key: string, op: () => Promise<T>): Promise<T> {
    const handle = this.handles.get(key);
    if (!handle) {
      throw new Error(`no member lease is held for ${key}`);
    }
    try {
      return await this.rt.runPromise(handle.runFenced(() => Effect.tryPromise({ try: op, catch: (cause) => cause })));
    } catch (error) {
      throw toLeaseError(error, key);
    }
  }

  async read(key: string): Promise<LeaseSnapshot | undefined> {
    try {
      return await this.rt.runPromise(this.manager.read(key));
    } catch (error) {
      throw toLeaseError(error, key);
    }
  }
}

/** Whether a lease record reads as held for the member status display. */
export function isLeaseHeld(record: LeaseSnapshot | undefined, staleAfterMs: number): boolean {
  if (!record || !record.holder) {
    return false;
  }
  return Date.now() - record.renewedAt < staleAfterMs;
}

export type { LeaseLost };
