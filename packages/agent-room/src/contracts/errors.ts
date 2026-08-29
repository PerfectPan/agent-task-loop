export const ROOM_VALIDATION_CODE = 'room-validation';
export const AGENT_SESSION_VALIDATION_CODE = 'agent-session-validation';

export class AgentSessionValidationError extends Error {
  readonly code = AGENT_SESSION_VALIDATION_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'AgentSessionValidationError';
  }
}

export class RoomValidationError extends Error {
  readonly code = ROOM_VALIDATION_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'RoomValidationError';
  }
}
