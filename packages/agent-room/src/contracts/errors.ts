export const ROOM_NOT_IMPLEMENTED_CODE = 'room-not-implemented';
export const ROOM_VALIDATION_CODE = 'room-validation';

export class RoomNotImplementedError extends Error {
  readonly code = ROOM_NOT_IMPLEMENTED_CODE;

  constructor(method: string) {
    super(`RoomStreamStore.${method} is not implemented in this slice`);
    this.name = 'RoomNotImplementedError';
  }
}

export class RoomValidationError extends Error {
  readonly code = ROOM_VALIDATION_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'RoomValidationError';
  }
}
