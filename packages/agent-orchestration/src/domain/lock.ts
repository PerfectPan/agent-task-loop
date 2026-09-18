import type { LockRecord } from '../contracts/ports';

export function sameLock(a: LockRecord, b: LockRecord): boolean {
  return a.key === b.key && a.holderPid === b.holderPid && a.holderId === b.holderId && a.heartbeatAt === b.heartbeatAt;
}

export function isLockFresh(
  lock: LockRecord,
  now: number,
  staleAfterMs: number,
  isAlive: (pid: number) => boolean,
): boolean {
  if (!isAlive(lock.holderPid)) {
    return false;
  }
  const at = Date.parse(lock.heartbeatAt);
  if (Number.isNaN(at)) {
    return false;
  }
  return now - at <= staleAfterMs;
}

export function holdsLock(
  lock: LockRecord | undefined,
  holder: { pid: number; id: string },
  now: number,
  staleAfterMs: number,
  isAlive: (pid: number) => boolean,
): boolean {
  return (
    !!lock &&
    lock.holderPid === holder.pid &&
    lock.holderId === holder.id &&
    isLockFresh(lock, now, staleAfterMs, isAlive)
  );
}
