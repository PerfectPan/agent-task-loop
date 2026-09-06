import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import {
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
} from '@remix-run/react';
import { RoomLab } from '../room-lab/presentation/RoomLab';
import { getRoomLabService } from '../room-lab/composition.server';
import {
  RoomLabBusyError,
  RoomLabInputError,
} from '../room-lab/application/room-lab-service.server';
import type {
  RoomLabAction,
  RoomLabActionResponse,
} from '../room-lab/read-model';
import { isRoomLabAgentId } from '../room-lab/domain/agent-roster';
import styles from '../room-lab/presentation/RoomLab.module.css';

const noStoreHeaders = { 'Cache-Control': 'no-store' };
const localOrigins = new Set([
  'http://127.0.0.1:3210',
  'http://localhost:3210',
]);

export async function loader(_args: LoaderFunctionArgs) {
  try {
    assertLocalRuntime();
  } catch (error) {
    if (error instanceof LocalRequestError) {
      throw json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    throw error;
  }
  return json(await getRoomLabService().snapshot(), { headers: noStoreHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    assertLocalRuntime();
    assertSameOriginJson(request);
    const input = parseRoomAction(await request.json().catch(() => {
      throw new RoomLabInputError('Room action must be valid JSON');
    }));
    const service = getRoomLabService();
    let state;
    switch (input.action) {
      case 'message':
        state = await service.sendMessage(input.body, request.signal);
        break;
      case 'compose':
        state = await service.compose(input.agentIds);
        break;
      case 'count-off':
        state = await service.runCountOff(request.signal);
        break;
      case 'retry':
        state = await service.retryHeld(input.agentId, request.signal);
        break;
      case 'task':
        state = await service.runTask(input.title);
        break;
      case 'reset':
        state = await service.reset();
        break;
      default:
        return json<RoomLabActionResponse>(
          { ok: false, error: 'Unknown Room action' },
          { status: 400, headers: noStoreHeaders },
        );
    }
    return json<RoomLabActionResponse>({ ok: true, state }, { headers: noStoreHeaders });
  } catch (error) {
    const status = error instanceof RoomLabBusyError
      ? 409
      : error instanceof RoomLabInputError
        ? 400
        : error instanceof LocalRequestError
          ? error.status
          : 500;
    const message = error instanceof Error ? error.message : 'Room action failed';
    return json<RoomLabActionResponse>(
      { ok: false, error: message },
      { status, headers: noStoreHeaders },
    );
  }
}

export default function RoomRoute() {
  return <RoomLab initialState={useLoaderData<typeof loader>()} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = routeErrorMessage(error);
  return (
    <main className={styles.unavailableShell}>
      <section role="alert" aria-labelledby="room-unavailable-title">
        <span>Rivus Room</span>
        <h1 id="room-unavailable-title">本地房间暂不可用</h1>
        <p>{message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          重新连接
        </button>
      </section>
    </main>
  );
}

function assertLocalRuntime(): void {
  if (
    process.env.VERCEL ||
    (process.env.NODE_ENV === 'production' && process.env.ROOM_LAB_LOCAL !== '1')
  ) {
    throw new LocalRequestError(403, 'Room flight deck is local-only');
  }
}

function assertSameOriginJson(request: Request): void {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new LocalRequestError(415, 'Room actions require application/json');
  }
  const origin = request.headers.get('Origin');
  if (!origin || !localOrigins.has(origin)) {
    throw new LocalRequestError(403, 'Room actions require a same-origin browser request');
  }
}

class LocalRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'LocalRequestError';
  }
}

function parseRoomAction(value: unknown): RoomLabAction {
  if (!value || typeof value !== 'object' || !('action' in value)) {
    throw new RoomLabInputError('Room action is invalid');
  }
  const input = value as Record<string, unknown>;
  switch (input.action) {
    case 'message':
      if (typeof input.body === 'string') return { action: 'message', body: input.body };
      break;
    case 'compose':
      if (
        Array.isArray(input.agentIds) &&
        input.agentIds.every(isRoomLabAgentId)
      ) {
        return { action: 'compose', agentIds: input.agentIds };
      }
      break;
    case 'retry':
      if (isRoomLabAgentId(input.agentId)) {
        return { action: 'retry', agentId: input.agentId };
      }
      break;
    case 'count-off':
      return { action: 'count-off' };
    case 'task':
      if (typeof input.title === 'string') return { action: 'task', title: input.title };
      break;
    case 'reset':
      return { action: 'reset' };
  }
  throw new RoomLabInputError('Room action payload is invalid');
}

function routeErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    const data = error.data as { error?: unknown } | undefined;
    if (typeof data?.error === 'string') return data.error;
    return `${error.status} ${error.statusText}`.trim();
  }
  return error instanceof Error ? error.message : 'The local Room service did not respond.';
}
