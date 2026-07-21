import type { ServerResponse } from 'node:http';
import type { PublicTaskDto } from '@rivus/agent-task-loop/task-manager';
import type { RunPhase } from './redact.js';
import { sanitizePublicTask } from './redact.js';

export interface TaskUpdatedEvent {
  type: 'task.updated';
  taskId: string;
  status: string;
  runPhase: RunPhase;
  task: PublicTaskDto;
}

export interface BoardRefreshEvent {
  type: 'board.refresh';
}

export type ConsoleSseEvent = TaskUpdatedEvent | BoardRefreshEvent;

type SseClient = {
  res: ServerResponse;
  send: (data: string) => void;
};

/**
 * In-process SSE broadcaster. Fans out `task.updated` events to all
 * connected clients. Each event carries the full public DTO.
 */
export class SseBroadcaster {
  private readonly clients = new Set<SseClient>();

  /**
   * Attach a new SSE client. Returns a function to send events to it.
   * The client is automatically removed when the connection closes.
   */
  attach(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const client: SseClient = {
      res,
      send(data: string) {
        res.write(`data: ${data}\n\n`);
      },
    };

    this.clients.add(client);
    res.write(': connected\n\n');

    res.on('close', () => {
      this.clients.delete(client);
    });
  }

  /**
   * Broadcast a `task.updated` event to all connected clients.
   * The task DTO is sanitized before sending.
   */
  broadcastTaskUpdated(event: Omit<TaskUpdatedEvent, 'task' | 'type'> & { task: PublicTaskDto }): void {
    const payload: TaskUpdatedEvent = {
      type: 'task.updated',
      taskId: event.taskId,
      status: event.status,
      runPhase: event.runPhase,
      task: sanitizePublicTask(event.task),
    };
    this.publish(payload);
  }

  broadcastBoardRefresh(): void {
    this.publish({ type: 'board.refresh' });
  }

  publish(event: ConsoleSseEvent): void {
    const data = JSON.stringify(
      event.type === 'task.updated'
        ? { ...event, task: sanitizePublicTask(event.task) }
        : event,
    );
    for (const client of this.clients) {
      client.send(data);
    }
  }

  /** Number of currently connected clients. */
  get clientCount(): number {
    return this.clients.size;
  }

  /** Disconnect all clients. */
  closeAll(): void {
    for (const client of this.clients) {
      client.res.end();
    }
    this.clients.clear();
  }
}
