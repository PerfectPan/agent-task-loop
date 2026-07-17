import type { AcceptanceVerdict, ReviewVerdict, TargetAgent, TaskRecord, TaskStatus } from '../types/task';

export interface PublicTaskDto {
  taskId: string;
  title: string;
  description: string;
  project: string;
  repository?: string;
  source?: string;
  targetAgent: TargetAgent;
  priority: number;
  status: TaskStatus;
  progressSummary?: string;
  resultSummary?: string;
  prLink?: string;
  currentOwner?: string;
  reviewRound?: number;
  reviewVerdict?: ReviewVerdict;
  acceptanceRound?: number;
  acceptanceVerdict?: AcceptanceVerdict;
  createdAt?: string;
  updatedAt?: string;
}

export function toPublicTask(task: TaskRecord): PublicTaskDto {
  return {
    taskId: bound(task.taskId, 128),
    title: bound(task.title, 200),
    description: bound(task.description, 4_000),
    project: bound(task.project, 120),
    ...(task.repository ? { repository: bound(task.repository, 240) } : {}),
    ...(task.source ? { source: bound(task.source, 240) } : {}),
    targetAgent: task.targetAgent,
    priority: task.priority,
    status: task.status,
    ...(task.progressSummary ? { progressSummary: bound(task.progressSummary, 2_000) } : {}),
    ...(task.resultSummary ? { resultSummary: bound(task.resultSummary, 2_000) } : {}),
    ...(task.prLink ? { prLink: bound(task.prLink, 2_048) } : {}),
    ...(task.currentOwner ? { currentOwner: bound(task.currentOwner, 120) } : {}),
    ...(task.reviewRound !== undefined ? { reviewRound: task.reviewRound } : {}),
    ...(task.reviewVerdict ? { reviewVerdict: task.reviewVerdict } : {}),
    ...(task.acceptanceRound !== undefined ? { acceptanceRound: task.acceptanceRound } : {}),
    ...(task.acceptanceVerdict ? { acceptanceVerdict: task.acceptanceVerdict } : {}),
    ...(task.createdAt ? { createdAt: bound(task.createdAt, 64) } : {}),
    ...(task.updatedAt ? { updatedAt: bound(task.updatedAt, 64) } : {}),
  };
}

function bound(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
