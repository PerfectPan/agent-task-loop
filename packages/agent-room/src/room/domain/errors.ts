export const ROOM_VALIDATION_CODE = 'room-validation';

export class RoomValidationError extends Error {
  readonly code = ROOM_VALIDATION_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'RoomValidationError';
  }
}
