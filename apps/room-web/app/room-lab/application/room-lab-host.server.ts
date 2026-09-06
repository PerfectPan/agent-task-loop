import { existsSync, readFileSync } from 'node:fs';
import type { RoomId } from '@rivus/agent-room';
import { RoomLabService, type RoomLabWorkspaceSnapshot } from './room-lab-service.server';
import type { AgentRunner } from './ports';
import { runLocalAgent } from '../infrastructure/local-agent-runner.server';
import { FileRoomConversation } from '../infrastructure/file-room-conversation.server';
import { LocalTaskDelivery } from '../infrastructure/local-task-delivery.server';
import { LocalTextPresenter } from '../infrastructure/local-text-presenter.server';
import {
  FileRoomCatalogStore,
  createRoomRecordInput,
  nowIso,
} from '../infrastructure/file-room-catalog.server';
import { RoomCatalog, RoomCatalogInvariantError } from '../domain/room-catalog';
import { RoomComposition } from '../domain/room-composition';
import type { RoomLabAgentId } from '../domain/agent-roster';
import type { RoomCatalogItemView, RoomLabState } from '../read-model';
import { writeJsonAtomic } from '../infrastructure/atomic-write.server';

const TENANT = 'local';

export class RoomLabHost {
  private readonly workspaces = new Map<string, RoomLabService>();
  private catalog: RoomCatalog;

  constructor(
    private readonly store: FileRoomCatalogStore = new FileRoomCatalogStore(),
    private readonly bindings: { agentRunner?: AgentRunner } = {},
  ) {
    this.catalog = store.load();
  }

  list() {
    return this.catalog.list();
  }

  lastOpened() {
    return this.catalog.lastOpened();
  }

  async create(input: {
    title: string;
    goal?: string;
    memberIds?: readonly RoomLabAgentId[];
  }): Promise<RoomLabState> {
    const record = this.catalog.create(createRoomRecordInput(input));
    this.store.save(this.catalog);
    return this.snapshot(record.id);
  }

  async snapshot(roomId: string): Promise<RoomLabState> {
    const record = this.catalog.touch(roomId, nowIso());
    this.store.save(this.catalog);
    const service = this.open(roomId);
    return this.decorate(await service.snapshot(), record.id);
  }

  open(roomId: string): RoomLabService {
    const existing = this.workspaces.get(roomId);
    if (existing) return existing;
    const record = this.catalog.get(roomId);
    const roomIdValue: RoomId = { tenantId: TENANT, conversationId: roomId };
    const service = new RoomLabService({
      conversation: new FileRoomConversation(this.store.roomDirectory(roomId), roomIdValue),
      agentRunner: this.bindings.agentRunner ?? runLocalAgent,
      taskDelivery: new LocalTaskDelivery(),
      textPresenter: new LocalTextPresenter(),
      composition: new RoomComposition(record.memberIds),
      onPersist: snapshot => {
        writeJsonAtomic(this.store.workspacePath(roomId), snapshot);
        const current = this.catalog.get(roomId);
        if (current.memberIds.join(',') !== snapshot.composition.join(',')) {
          this.catalog.replaceMembers(roomId, snapshot.composition, nowIso());
          this.store.save(this.catalog);
        }
      },
    });
    const workspaceFile = this.store.workspacePath(roomId);
    if (existsSync(workspaceFile)) {
      const saved = JSON.parse(readFileSync(workspaceFile, 'utf8')) as RoomLabWorkspaceSnapshot;
      service.restore(saved);
    }
    this.workspaces.set(roomId, service);
    return service;
  }

  decorate(state: RoomLabState, roomId: string): RoomLabState {
    const record = this.catalog.get(roomId);
    return {
      ...state,
      roomId,
      title: record.title,
      ...(record.goal === undefined ? {} : { goal: record.goal }),
      catalog: this.catalogView(),
    };
  }

  catalogView(): RoomCatalogItemView[] {
    return this.catalog.list().map(room => ({
      id: room.id,
      title: room.title,
      updatedAt: room.updatedAt,
    }));
  }
}

export { RoomCatalogInvariantError };
