import type { TaskDeliveryRepository } from '../application/task-delivery-ports';
import type { TaskDeliverySnapshot } from '../domain/model';

export class MemoryTaskDeliveryRepository implements TaskDeliveryRepository {
  private readonly tasks = new Map<string, TaskDeliverySnapshot>();

  get(taskId: string): TaskDeliverySnapshot | undefined {
    const task = this.tasks.get(taskId);
    return task ? { ...task } : undefined;
  }

  create(snapshot: TaskDeliverySnapshot): boolean {
    if (this.tasks.has(snapshot.taskId)) return false;
    this.tasks.set(snapshot.taskId, { ...snapshot });
    return true;
  }

  save(snapshot: TaskDeliverySnapshot): void {
    if (!this.tasks.has(snapshot.taskId)) {
      throw new Error(`Task ${snapshot.taskId} does not exist`);
    }
    this.tasks.set(snapshot.taskId, { ...snapshot });
  }
}
