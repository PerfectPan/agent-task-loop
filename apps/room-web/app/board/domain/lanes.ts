import type { TaskRecord, TaskStatus } from '@rivus/agent-task-loop/task-management';

export type LaneId = 'todo' | 'running' | 'review' | 'decide' | 'done';

export interface Lane {
  id: LaneId;
  /** Chinese label shown as the column heading. */
  title: string;
  /** The statuses this lane collects, in pipeline order. */
  statuses: readonly TaskStatus[];
  tasks: TaskRecord[];
}

interface LaneDefinition {
  id: LaneId;
  title: string;
  statuses: readonly TaskStatus[];
}

const LANE_DEFINITIONS: readonly LaneDefinition[] = [
  {
    id: 'todo',
    title: '待办',
    statuses: ['待处理'],
  },
  {
    id: 'running',
    title: '进行中',
    statuses: ['进行中', '执行中', '修复中'],
  },
  {
    id: 'review',
    title: '审核中',
    statuses: ['待复核'],
  },
  {
    id: 'decide',
    title: '待你决定',
    statuses: ['待决策', '待发布', '待验收'],
  },
  {
    id: 'done',
    title: '已结束',
    statuses: ['已完成', '已失败'],
  },
];

const STATUS_TO_LANE_ID = new Map<TaskStatus, LaneId>(
  LANE_DEFINITIONS.flatMap((lane) => lane.statuses.map((status) => [status, lane.id])),
);

/** The lane a status belongs to. */
export function laneOf(status: TaskStatus): LaneId {
  const laneId = STATUS_TO_LANE_ID.get(status);
  if (!laneId) {
    throw new Error(`Unknown status: ${status}`);
  }
  return laneId;
}

function parseUpdatedAt(value: string | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareTasks(a: TaskRecord, b: TaskRecord): number {
  const priorityA = a.priority ?? Number.POSITIVE_INFINITY;
  const priorityB = b.priority ?? Number.POSITIVE_INFINITY;
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  const updatedA = parseUpdatedAt(a.updatedAt);
  const updatedB = parseUpdatedAt(b.updatedAt);
  if (updatedA !== updatedB) {
    return updatedB - updatedA;
  }

  return a.taskId.localeCompare(b.taskId);
}

/** All five lanes, always in this order, empty lanes included. */
export function groupIntoLanes(tasks: readonly TaskRecord[]): Lane[] {
  const lanes: Lane[] = LANE_DEFINITIONS.map((def) => ({
    id: def.id,
    title: def.title,
    statuses: def.statuses,
    tasks: [],
  }));

  const laneIndexById = new Map<LaneId, number>(
    lanes.map((lane, index) => [lane.id, index]),
  );

  for (const task of tasks) {
    const laneId = STATUS_TO_LANE_ID.get(task.status);
    if (!laneId) {
      continue;
    }
    const index = laneIndexById.get(laneId);
    if (index !== undefined) {
      lanes[index].tasks.push(task);
    }
  }

  for (const lane of lanes) {
    lane.tasks.sort(compareTasks);
  }

  return lanes;
}
