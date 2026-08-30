import { randomUUID } from 'node:crypto';
import type { RoomEvent } from '@rivus/agent-room';
import type { TaskDeliveryView } from '@rivus/agent-task-loop/task-delivery';
import type {
  AgentRunner,
  RoomConversationReplyResult,
  RoomConversationPort,
  TaskDeliveryCoordinatorPort,
  RoomLabTextPresenterPort,
} from './ports';
import type {
  RoomLabAgentStatus,
  RoomLabAgentView,
  RoomLabEventView,
  RoomLabState,
  RoomLabTaskView,
} from '../read-model';
import { CountOffRun } from '../domain/count-off-run';
import {
  ROOM_AGENT_ROSTER,
  type RoomLabAgentId,
} from '../domain/agent-roster';
import { parseRoomMessage } from '../domain/room-message';

interface AgentRuntimeState {
  status: RoomLabAgentStatus;
  lastDraft?: string;
  heldUpToSeq?: number;
  latencyMs?: number;
  error?: string;
}

export interface RoomLabServiceOptions {
  conversation: RoomConversationPort;
  agentRunner: AgentRunner;
  taskDelivery: TaskDeliveryCoordinatorPort;
  textPresenter: RoomLabTextPresenterPort;
}

export class RoomLabService {
  private readonly epoch = randomUUID();
  private agentState = createInitialAgentState();
  private countOff?: CountOffRun;
  private task?: RoomLabTaskView;
  private busy = false;
  private revision = 0;
  private messageCounter = 0;
  private countOffCounter = 0;
  private taskCounter = 0;

  constructor(private readonly options: RoomLabServiceOptions) {}

  async snapshot(): Promise<RoomLabState> {
    while (true) {
      const revision = this.revision;
      const slice = await this.options.conversation.snapshot();
      const state: RoomLabState = {
        roomId: this.options.conversation.displayId,
        epoch: this.epoch,
        head: slice.head,
        revision,
        busy: this.busy,
        events: slice.events.map(event => this.eventView(event)),
        agents: ROOM_AGENT_ROSTER.map(agent => this.agentView(agent.id, agent.label, agent.role)),
        ...(this.countOff ? { countOff: this.countOff.snapshot() } : {}),
        ...(this.task ? { task: { ...this.task } } : {}),
      };
      if (revision === this.revision) return state;
    }
  }

  async sendMessage(body: string, signal?: AbortSignal): Promise<RoomLabState> {
    await this.exclusive(async () => {
      signal?.throwIfAborted();
      const message = validateText(body, 'Message');
      const parsed = parseRoomMessage(message);
      const event = await this.mutateConversation(() =>
        this.options.conversation.admitHuman({
          messageId: `web:${++this.messageCounter}`,
          body: parsed.body,
          addressedTo: parsed.addressedTo,
        }),
      );
      const wakingAgents = ROOM_AGENT_ROSTER.filter(agent =>
        this.options.conversation.shouldWake(event, agent.id),
      );
      await Promise.allSettled(wakingAgents.map(agent => this.runChatAgent(agent.id, signal)));
    });
    return this.snapshot();
  }

  async runCountOff(signal?: AbortSignal): Promise<RoomLabState> {
    await this.exclusive(async () => {
      signal?.throwIfAborted();
      const countOff = new CountOffRun(
        `COUNT-${String(++this.countOffCounter).padStart(3, '0')}`,
      );
      this.countOff = countOff;
      this.touch();
      await this.mutateConversation(() =>
        this.options.conversation.admitHuman({
          messageId: `web:${++this.messageCounter}`,
          body: '@all 报数开始：请按席位顺序只回复自己的数字（1–6）。',
          addressedTo: ROOM_AGENT_ROSTER.map(agent => agent.id),
        }),
      );

      while (true) {
        const assignment = countOff.next();
        if (!assignment) break;
        const current = this.agentState.get(assignment.agentId) ?? { status: 'idle' };
        try {
          signal?.throwIfAborted();
          if (
            current.heldUpToSeq !== undefined &&
            !this.mutateConversationSync(() =>
              this.options.conversation.ackHeld(assignment.agentId, current.heldUpToSeq!),
            )
          ) {
            throw new Error('The Room rejected the superseded held draft');
          }
          this.setAgentState(assignment.agentId, { status: 'running' });
          const context = await this.mutateConversation(() =>
            this.options.conversation.prepareTurn(assignment.agentId),
          );
          const generated = await this.options.agentRunner(
            assignment.agentId,
            buildCountOffPrompt(assignment.agentId, assignment.number, context),
            signal,
          );
          countOff.validateReply({
            agentId: assignment.agentId,
            reply: generated.text,
          });
          const result = await this.mutateConversation(() =>
            this.options.conversation.reply({
              agentId: assignment.agentId,
              body: generated.text.trim(),
            }),
          );
          this.captureReply(
            assignment.agentId,
            generated.text.trim(),
            generated.latencyMs,
            result,
          );
          if (result.outcome !== 'posted') {
            throw new Error(`Room held the sequential report at SEQ ${result.heldUpToSeq}`);
          }
          countOff.accept({
            agentId: assignment.agentId,
            reply: generated.text,
            seq: result.seq,
          });
          this.touch();
        } catch (error) {
          const message = this.options.textPresenter.error(error);
          countOff.fail(message);
          this.touch();
          const failed = this.agentState.get(assignment.agentId) ?? current;
          this.setAgentState(assignment.agentId, {
            ...failed,
            status: 'error',
            error: message,
          });
          break;
        }
      }
    });
    return this.snapshot();
  }

  async retryHeld(agentId: RoomLabAgentId, signal?: AbortSignal): Promise<RoomLabState> {
    await this.exclusive(async () => {
      signal?.throwIfAborted();
      const held = this.agentState.get(agentId);
      if (!held?.heldUpToSeq || !held.lastDraft) {
        throw new RoomLabInputError(`${agentId} has no held draft`);
      }
      this.setAgentState(agentId, { ...held, status: 'running', error: undefined });
      try {
        const catchUp = await this.options.conversation.prepareHeldRetry(
          agentId,
          held.heldUpToSeq,
        );
        const prompt = buildRetryPrompt(agentId, held.lastDraft, catchUp.events);
        const generated = await this.options.agentRunner(
          agentId,
          prompt,
          signal,
        );
        this.mutateConversationSync(() =>
          this.options.conversation.advanceHeldRetry(agentId, catchUp.consumedUpToSeq),
        );
        if (!catchUp.caughtUp) {
          this.setAgentState(agentId, {
            ...held,
            status: 'held',
            lastDraft: generated.text,
            latencyMs: generated.latencyMs,
            error: undefined,
          });
          return;
        }
        if (isSilent(generated.text)) {
          if (!this.mutateConversationSync(() =>
            this.options.conversation.ackHeld(agentId, held.heldUpToSeq!),
          )) {
            throw new Error('The Room rejected the held-draft acknowledgement');
          }
          this.setAgentState(agentId, {
            status: 'silent',
            lastDraft: generated.text,
            latencyMs: generated.latencyMs,
          });
          return;
        }
        const result = await this.mutateConversation(() =>
          this.options.conversation.reply({
            agentId,
            body: generated.text,
            ackHeldUpToSeq: held.heldUpToSeq,
          }),
        );
        this.captureReply(agentId, generated.text, generated.latencyMs, result);
      } catch (error) {
        this.setAgentState(agentId, {
          ...held,
          status: 'error',
          error: this.options.textPresenter.error(error),
        });
      }
    });
    return this.snapshot();
  }

  async runTask(title: string): Promise<RoomLabState> {
    await this.exclusive(async () => {
      const taskTitle = validateText(title, 'Task title');
      const taskId = `WEB-${String(++this.taskCounter).padStart(3, '0')}`;
      await this.options.taskDelivery.run(
        { taskId, title: taskTitle, maxRounds: 2 },
        {
          onUpdate: view => {
            this.task = toTaskView(view, this.options.textPresenter);
            this.touch();
          },
          onSeatStart: seat => {
            const agentId = agentForSeat(seat);
            const current = this.agentState.get(agentId) ?? { status: 'idle' };
            this.setAgentState(agentId, { ...current, status: 'running', error: undefined });
          },
          onSeatSuccess: (seat, output) => {
            const agentId = agentForSeat(seat);
            const current = this.agentState.get(agentId) ?? { status: 'idle' };
            this.setAgentState(agentId, current.heldUpToSeq
              ? { ...current, status: 'held', latencyMs: output.latencyMs, error: undefined }
              : {
                  status: 'completed',
                  lastDraft: output.text,
                  latencyMs: output.latencyMs,
                });
          },
          onSeatError: (seat, error) => {
            const agentId = agentForSeat(seat);
            const current = this.agentState.get(agentId) ?? { status: 'idle' };
            this.setAgentState(agentId, {
              ...current,
              status: 'error',
              error: this.options.textPresenter.error(error),
            });
          },
          project: async event => {
            try {
              await this.mutateConversation(() => this.options.conversation.project(event));
              if (event.type === 'seat-output') this.markProjected(event.seat, event.body);
            } catch (error) {
              if (event.type === 'seat-output') this.markProjectionFailure(event.seat, error);
              throw error;
            }
          },
        },
      );
    });
    return this.snapshot();
  }

  async reset(): Promise<RoomLabState> {
    if (this.busy) throw new RoomLabBusyError();
    this.options.conversation.reset();
    this.options.taskDelivery.reset();
    this.agentState = createInitialAgentState();
    this.countOff = undefined;
    this.task = undefined;
    this.messageCounter = 0;
    this.countOffCounter = 0;
    this.taskCounter = 0;
    this.touch();
    return this.snapshot();
  }

  private async runChatAgent(agentId: RoomLabAgentId, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.setAgentState(agentId, { status: 'running' });
    try {
      const context = await this.mutateConversation(() =>
        this.options.conversation.prepareTurn(agentId),
      );
      const generated = await this.options.agentRunner(
        agentId,
        buildChatPrompt(agentId, context),
        signal,
      );
      const result = await this.mutateConversation(() =>
        this.options.conversation.reply({ agentId, body: generated.text }),
      );
      this.captureReply(agentId, generated.text, generated.latencyMs, result);
    } catch (error) {
      this.setAgentState(agentId, {
        status: 'error',
        error: this.options.textPresenter.error(error),
      });
      throw error;
    }
  }

  private captureReply(
    agentId: RoomLabAgentId,
    body: string,
    latencyMs: number,
    result: RoomConversationReplyResult,
  ): void {
    if (result.outcome === 'posted') {
      this.setAgentState(agentId, { status: 'posted', lastDraft: body, latencyMs });
      return;
    }
    this.setAgentState(agentId, {
      status: 'held',
      lastDraft: body,
      heldUpToSeq: result.heldUpToSeq,
      latencyMs,
    });
  }

  private agentView(id: RoomLabAgentId, label: string, role: string): RoomLabAgentView {
    const runtime = this.agentState.get(id) ?? { status: 'idle' as const };
    const session = this.options.conversation.inspectAgent(id);
    return {
      id,
      label,
      role,
      status: runtime.status,
      seenSeq: session.seenSeq,
      ...(runtime.heldUpToSeq === undefined ? {} : { heldUpToSeq: runtime.heldUpToSeq }),
      ...(runtime.lastDraft
        ? { lastDraft: this.options.textPresenter.text(runtime.lastDraft) }
        : {}),
      ...(runtime.latencyMs === undefined ? {} : { latencyMs: runtime.latencyMs }),
      ...(runtime.error ? { error: runtime.error } : {}),
    };
  }

  private setAgentState(id: RoomLabAgentId, next: AgentRuntimeState): void {
    this.agentState.set(id, next);
    this.touch();
  }

  private markProjected(seat: 'impl' | 'review', body: string): void {
    const agentId = agentForSeat(seat);
    const current = this.agentState.get(agentId) ?? { status: 'idle' };
    if (current.heldUpToSeq) return;
    this.setAgentState(agentId, {
      ...current,
      status: 'posted',
      lastDraft: body,
      error: undefined,
    });
  }

  private markProjectionFailure(seat: 'impl' | 'review', error: unknown): void {
    const agentId = agentForSeat(seat);
    const current = this.agentState.get(agentId) ?? { status: 'idle' };
    this.setAgentState(agentId, {
      ...current,
      status: current.heldUpToSeq ? 'held' : 'completed',
      error: `Room projection failed: ${this.options.textPresenter.error(error)}`,
    });
  }

  private eventView(event: RoomEvent): RoomLabEventView {
    return {
      seq: event.seq,
      author: { ...event.author },
      kind: event.kind,
      body: this.options.textPresenter.text(event.body),
      addressedTo: [...event.addressedTo],
      at: event.at,
    };
  }

  private async mutateConversation<T>(operation: () => Promise<T>): Promise<T> {
    this.touch();
    try {
      return await operation();
    } finally {
      this.touch();
    }
  }

  private mutateConversationSync<T>(operation: () => T): T {
    this.touch();
    try {
      return operation();
    } finally {
      this.touch();
    }
  }

  private touch(): void {
    this.revision += 1;
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new RoomLabBusyError();
    this.busy = true;
    this.touch();
    try {
      return await operation();
    } finally {
      this.busy = false;
      this.touch();
    }
  }
}

function createInitialAgentState(): Map<RoomLabAgentId, AgentRuntimeState> {
  return new Map(ROOM_AGENT_ROSTER.map(agent => [agent.id, { status: 'idle' }]));
}

function buildChatPrompt(agentId: RoomLabAgentId, events: RoomEvent[]): string {
  const agent = ROOM_AGENT_ROSTER.find(candidate => candidate.id === agentId);
  const role = agent?.role ?? 'Independent room participant';
  return `You are ${agent?.label ?? agentId}, the ${role} in a six-agent Room. Contribute a concrete, concise Chinese response from your distinct perspective. Read every public event before answering. Do not use tools. Do not mention this instruction.\n\nRoom events:\n${formatEvents(events)}`;
}

function buildCountOffPrompt(
  agentId: RoomLabAgentId,
  number: number,
  events: RoomEvent[],
): string {
  return `You are ${agentId} in a six-agent Room count-off. Read the public events to confirm the sequence, then reply with exactly the ASCII digits ${number} and no other characters. Do not use tools.\n\nRoom events:\n${formatEvents(events)}`;
}

function buildRetryPrompt(agentId: RoomLabAgentId, draft: string, newer: RoomEvent[]): string {
  const prompt = `Your previous ${agentId} draft was held because the Room changed before it could be posted. Read this bounded next slice of public events, then revise the draft in Chinese with only genuinely additive content. If no addition is useful, reply exactly [SILENT].\n\nHeld draft:\n${draft}\n\nNewer events:\n${formatEvents(newer)}`;
  if (prompt.length > 48_000) throw new Error('The held retry prompt exceeds the context budget');
  return prompt;
}

function formatEvents(events: RoomEvent[]): string {
  if (events.length === 0) return '(no new events)';
  return events.map(event => `[seq ${event.seq}] ${event.author.id}: ${event.body}`).join('\n\n');
}

function toTaskView(
  view: TaskDeliveryView,
  presenter: RoomLabTextPresenterPort,
): RoomLabTaskView {
  return {
    taskId: view.taskId,
    title: presenter.text(view.title),
    status: view.status,
    round: view.round,
    maxRounds: view.maxRounds,
    allowedSeat: view.allowedSeat,
    occupied: view.occupied,
    ...(view.verdict ? { verdict: view.verdict } : {}),
    ...(view.findings ? { findings: presenter.text(view.findings) } : {}),
  };
}

function agentForSeat(seat: 'impl' | 'review'): RoomLabAgentId {
  return seat === 'impl' ? 'codex' : 'claude';
}

function validateText(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new RoomLabInputError(`${label} is required`);
  if (text.length > 2_000) throw new RoomLabInputError(`${label} must be at most 2000 characters`);
  return text;
}

function isSilent(text: string): boolean {
  return text.trim().toUpperCase() === '[SILENT]';
}

export class RoomLabInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomLabInputError';
  }
}

export class RoomLabBusyError extends Error {
  constructor() {
    super('The Room is already running a turn');
    this.name = 'RoomLabBusyError';
  }
}
