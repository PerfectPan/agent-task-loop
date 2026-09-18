export class TaskDeliveryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskDeliveryValidationError';
  }
}

export class TaskDeliveryTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskDeliveryTransitionError';
  }
}
