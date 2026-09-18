export const AGENT_SESSION_VALIDATION_CODE = 'agent-session-validation';

export class AgentSessionValidationError extends Error {
  readonly code = AGENT_SESSION_VALIDATION_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'AgentSessionValidationError';
  }
}
