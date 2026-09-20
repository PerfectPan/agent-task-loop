import { LocalRequestError } from '../infrastructure/local-guard.server';
import { RoomCatalogInvariantError } from '../domain/room-catalog';
import { RoomLabBusyError, RoomLabInputError } from './room-lab-service.server';

/**
 * One ladder for every Room action, so a new error class is taught to the
 * product once instead of to each route. Three routes used to carry their own
 * copy and they had already drifted: a busy room answered 409 on one and 500
 * on another.
 */
export function roomActionStatus(error: unknown): number {
  if (error instanceof RoomLabBusyError) return 409;
  if (error instanceof RoomLabInputError) return 400;
  if (error instanceof RoomCatalogInvariantError) return 400;
  if (error instanceof LocalRequestError) return error.status;
  return 500;
}

export function roomActionMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Room action failed';
}
