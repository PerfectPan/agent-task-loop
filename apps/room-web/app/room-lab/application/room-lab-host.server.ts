import type { RoomLabWorkspaceSnapshot } from './room-lab-service.server';
import { RoomLabService } from './room-lab-service.server';
import type { AgentRunner } from './ports';
import {
  listRoomAgentInventory,
  runnableInventory,
} from './room-agent-inventory.server';
import { runLocalAgent } from '../infrastructure/local-agent-runner.server';
import { LocalTaskDelivery } from '../infrastructure/local-task-delivery.server';
import { LocalTextPresenter } from '../infrastructure/local-text-presenter.server';
import {
  createRoomRecordInput,
  nowIso,
} from '../infrastructure/file-room-catalog.server';
import { SqliteRoomStore } from '../infrastructure/sqlite-room-store.server';
import { RoomCatalog, RoomCatalogInvariantError } from '../domain/room-catalog';
import { RoomComposition } from '../domain/room-composition';
import type { RoomLabAgentId } from '../domain/agent-roster';
import type {
  AgentDeskView,
  RoomAgentInventoryItem,
  RoomCatalogItemView,
  RoomLabAction,
  RoomLabState,
} from '../read-model';

export class RoomLabHost {
  private readonly workspaces = new Map<string, RoomLabService>();
  private catalog: RoomCatalog;
  private inventoryCache?: RoomAgentInventoryItem[];

  constructor(
    private readonly store: SqliteRoomStore = SqliteRoomStore.open(),
    private readonly bindings: {
      agentRunner?: AgentRunner;
      listAgents?: () => RoomAgentInventoryItem[];
    } = {},
  ) {
    this.catalog = store.loadCatalog();
  }

  list() {
    return this.catalog.list();
  }

  lastOpened() {
    return this.catalog.lastOpened();
  }

  inventory(): RoomAgentInventoryItem[] {
    return this.inventoryCache ??= this.bindings.listAgents?.() ?? listRoomAgentInventory();
  }

  refreshInventory(): RoomAgentInventoryItem[] {
    this.inventoryCache = undefined;
    return this.inventory();
  }

  agentDesk(): AgentDeskView {
    const rooms = this.list();
    const lastOpenedId = this.lastOpened()?.id;
    return {
      ...(lastOpenedId === undefined ? {} : { lastOpenedId }),
      agents: this.inventory().map(agent => ({
        ...agent,
        seatedIn: rooms
          .filter(room => room.memberIds.includes(agent.id))
          .map(room => ({ id: room.id, title: room.title })),
      })),
    };
  }

  async create(input: {
    title: string;
    goal?: string;
    memberIds?: readonly RoomLabAgentId[];
  }): Promise<RoomLabState> {
    const record = this.catalog.create(createRoomRecordInput(input));
    this.store.saveCatalog(this.catalog);
    return this.snapshot(record.id);
  }

  async snapshot(roomId: string): Promise<RoomLabState> {
    if (this.catalog.lastOpened()?.id !== roomId) {
      this.catalog.touch(roomId, nowIso());
      this.store.saveCatalog(this.catalog);
    }
    const service = this.open(roomId);
    return this.decorate(await service.snapshot(), roomId);
  }

  async act(
    roomId: string,
    input: Exclude<RoomLabAction, { action: 'create' }>,
    signal?: AbortSignal,
  ): Promise<RoomLabState> {
    const service = this.open(roomId);
    let state: RoomLabState;
    switch (input.action) {
      case 'message':
        state = await service.sendMessage(input.body, undefined, input.clientMessageId);
        break;
      case 'compose':
        state = await service.compose(input.agentIds);
        break;
      case 'count-off':
        state = await service.runCountOff(signal);
        break;
      case 'retry':
        state = await service.retryHeld(input.agentId, signal);
        break;
      case 'task':
        state = await service.runTask(input.title);
        break;
      case 'reset':
        state = await service.reset();
        break;
      default:
        throw new Error('Unknown Room action');
    }
    return this.decorate(state, roomId);
  }

  open(roomId: string): RoomLabService {
    const existing = this.workspaces.get(roomId);
    if (existing) return existing;
    const record = this.catalog.get(roomId);
    const service = new RoomLabService({
      conversation: this.store.conversation(roomId),
      agentRunner: this.bindings.agentRunner ?? runLocalAgent,
      taskDelivery: new LocalTaskDelivery(),
      textPresenter: new LocalTextPresenter(),
      composition: new RoomComposition(record.memberIds),
      onPersist: snapshot => {
        this.store.saveWorkspace(roomId, snapshot, nowIso());
        const current = this.catalog.get(roomId);
        if (current.memberIds.join(',') !== snapshot.composition.join(',')) {
          this.catalog.replaceMembers(roomId, snapshot.composition, nowIso());
          this.store.saveCatalog(this.catalog);
        }
      },
    });
    const saved = this.store.loadWorkspace(roomId);
    if (saved) service.restore(saved);
    this.workspaces.set(roomId, service);
    return service;
  }

  decorate(state: RoomLabState, roomId: string): RoomLabState {
    const record = this.catalog.get(roomId);
    const inventory = new Map(this.inventory().map(agent => [agent.id, agent]));
    return {
      ...state,
      roomId,
      title: record.title,
      ...(record.goal === undefined ? {} : { goal: record.goal }),
      catalog: this.catalogView(),
      agents: state.agents.map(agent => {
        const listed = inventory.get(agent.id);
        return {
          ...agent,
          availability: listed?.availability ?? 'missing',
          ...(listed?.command ? { command: listed.command } : {}),
          ...(listed?.version ? { version: listed.version } : {}),
        };
      }),
    };
  }

  catalogView(): RoomCatalogItemView[] {
    return this.catalog.list().map(room => {
      const preview = this.store.preview(room.id);
      return {
        id: room.id,
        title: room.title,
        updatedAt: preview.lastAt ?? room.updatedAt,
        memberCount: room.memberIds.length,
        ...(preview.lastLine === undefined ? {} : { lastLine: preview.lastLine }),
      };
    });
  }
}

export { RoomCatalogInvariantError, runnableInventory };
