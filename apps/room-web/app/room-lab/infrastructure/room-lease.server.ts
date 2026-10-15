import { join } from 'node:path';
import { NodePlatformLive } from '@rivus/agent-kit/node/effect';
import type { PlatformService as PlatformServiceTag } from '@rivus/agent-kit/platform/effect';
import {
  createLeaseManager,
  sqliteLeaseRepository,
  type LeaseConfigInvalid,
  type LeaseHandle,
  type LeaseHeld,
  type LeaseLost,
  type LeaseRepositoryFailure,
  type LeaseRepository,
  type LeaseManager,
} from '@rivus/agent-kit-collab/lease';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

/**
 * The member lease, adopted from `@rivus/agent-kit-collab`'s `/lease`: one row
 * per (room, member) key in a SQLite database of its own, kept fresh by the
 * kit's own heartbeat fiber and fenced through the kit's per-key guard. The
 * timing is the old one: renewed every 15 s, judged stale by an observer after
 * 120 s without a confirmed renewal.
 */
export const ROOM_LEASE_TTL_MS = 120_000;
export const ROOM_LEASE_HEARTBEAT_MS = 15_000;

/** The lease environment the host's assembly root provides to every lane activation. */
export function roomLeaseRepositoryLayer(
  path: string,
): Layer.Layer<LeaseRepository | PlatformServiceTag, LeaseRepositoryFailure> {
  return sqliteLeaseRepository({ path }).pipe(Layer.provideMerge(NodePlatformLive));
}

/** The lease configuration is out of range, or the heartbeat does not fit twice into the TTL. */
export class RoomLeaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomLeaseConfigError';
  }
}

/** The lease repository could not read or write a record; the lease's state is unknown, not changed. */
export class RoomLeaseStoreError extends Error {
  readonly key: string;
  readonly reason: LeaseRepositoryFailure['reason'];

  constructor(failure: LeaseRepositoryFailure) {
    super(failure.message);
    this.name = 'RoomLeaseStoreError';
    this.key = failure.key;
    this.reason = failure.reason;
  }
}

/** Another live holder keeps the key. */
export class RoomLeaseHeldError extends Error {
  readonly key: string;
  readonly holderPid: number | undefined;

  constructor(held: LeaseHeld) {
    super(`member lease ${held.key} is held by process ${held.holder.pid}`);
    this.name = 'RoomLeaseHeldError';
    this.key = held.key;
    this.holderPid = held.holder.pid;
  }
}

/** This acquisition no longer holds the lease: taken over, released, vanished, or expired. */
export class RoomLeaseLostError extends Error {
  readonly key: string;
  readonly reason: LeaseLost['reason'];

  constructor(lost: LeaseLost) {
    super(`member lease ${lost.key} was lost (${lost.reason})`);
    this.name = 'RoomLeaseLostError';
    this.key = lost.key;
    this.reason = lost.reason;
  }
}

function isTagged(error: unknown, tag: string): boolean {
  return typeof error === 'object' && error !== null && '_tag' in error && error._tag === tag;
}

/** Translates the kit's tagged lease errors into the Error surface the Promise side rejects with. */
export function toLeaseError(error: unknown, key: string): Error {
  if (isTagged(error, 'LeaseHeld')) {
    return new RoomLeaseHeldError(error as LeaseHeld);
  }
  if (isTagged(error, 'LeaseLost')) {
    return new RoomLeaseLostError(error as LeaseLost);
  }
  if (isTagged(error, 'FenceRejected')) {
    return new Error(`member lease ${key} fenced a write with an older generation`);
  }
  if (isTagged(error, 'LeaseConfigInvalid')) {
    return new RoomLeaseConfigError((error as LeaseConfigInvalid).message);
  }
  if (isTagged(error, 'LeaseRepositoryFailure')) {
    return new RoomLeaseStoreError(error as LeaseRepositoryFailure);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/** Builds the lease manager over the repository and platform the host provides. */
export function createRoomLeaseManager(): Effect.Effect<
  LeaseManager,
  LeaseConfigInvalid,
  LeaseRepository | PlatformServiceTag
> {
  return createLeaseManager({ ttlMs: ROOM_LEASE_TTL_MS, heartbeatMs: ROOM_LEASE_HEARTBEAT_MS });
}

/** The database file the member leases live in, inside the room home. */
export function roomLeasePath(roomHome: string): string {
  return join(roomHome, 'member-leases.sqlite');
}

/** One held member lease, as the lane activation keeps it for its turn's fenced writes. */
export type HeldRoomLease = LeaseHandle;
