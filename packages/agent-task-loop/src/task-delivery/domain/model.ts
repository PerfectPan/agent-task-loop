export type TaskDeliverySeat = 'impl' | 'review';

export type TaskDeliveryStatus =
  | 'executing'
  | 'reviewing'
  | 'reworking'
  | 'passed'
  | 'changes-requested'
  | 'failed';

export type TaskReviewVerdict = 'PASS' | 'CHANGES_REQUESTED';

export interface TaskDeliverySnapshot {
  taskId: string;
  title: string;
  status: TaskDeliveryStatus;
  round: number;
  maxRounds: number;
  implementation?: string;
  verdict?: TaskReviewVerdict;
  findings?: string;
}
