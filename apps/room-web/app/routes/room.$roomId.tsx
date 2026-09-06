import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import {
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
} from '@remix-run/react';
import { RoomLab } from '../room-lab/presentation/RoomLab';
import { getRoomLabHost } from '../room-lab/composition.server';
import {
  RoomLabBusyError,
  RoomLabInputError,
} from '../room-lab/application/room-lab-service.server';
import type { RoomLabActionResponse } from '../room-lab/read-model';
import { parseRoomAction } from '../room-lab/application/parse-room-action';
import { RoomCatalogInvariantError } from '../room-lab/domain/room-catalog';
import { isRoomIdentity } from '../room-lab/domain/room-identity';
import {
  LocalRequestError,
  assertLocalRuntime,
  assertSameOriginJson,
  noStoreHeaders,
} from '../room-lab/infrastructure/local-guard.server';

export async function loader({ params }: LoaderFunctionArgs) {
  try {
    assertLocalRuntime();
    const roomId = params.roomId;
    if (!roomId || !isRoomIdentity(roomId)) {
      throw new LocalRequestError(404, 'Unknown Room');
    }
    return json(await getRoomLabHost().snapshot(roomId), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof RoomCatalogInvariantError) {
      throw json({ error: error.message }, { status: 404, headers: noStoreHeaders });
    }
    if (error instanceof LocalRequestError) {
      throw json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    throw error;
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    assertLocalRuntime();
    assertSameOriginJson(request);
    const roomId = params.roomId;
    if (!roomId || !isRoomIdentity(roomId)) {
      throw new LocalRequestError(404, 'Unknown Room');
    }
    const input = parseRoomAction(await request.json().catch(() => {
      throw new RoomLabInputError('Room action must be valid JSON');
    }));
    const host = getRoomLabHost();
    if (input.action === 'create') {
      const created = await host.create({
        title: input.title,
        ...(input.goal === undefined ? {} : { goal: input.goal }),
        ...(input.agentIds === undefined ? {} : { memberIds: input.agentIds }),
      });
      return json<RoomLabActionResponse>({ ok: true, state: created }, { headers: noStoreHeaders });
    }
    const service = host.open(roomId);
    let state;
    switch (input.action) {
      case 'message':
        state = await service.sendMessage(input.body, undefined, input.clientMessageId);
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
    return json<RoomLabActionResponse>(
      { ok: true, state: host.decorate(state, roomId) },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const status = error instanceof RoomLabBusyError
      ? 409
      : error instanceof RoomLabInputError || error instanceof RoomCatalogInvariantError
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
  const initialState = useLoaderData<typeof loader>();
  return <RoomLab key={initialState.roomId} initialState={initialState} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = routeErrorMessage(error);
  return (
    <main className="min-h-dvh bg-paper bg-[url('/images/garden.jpg')] bg-cover bg-center px-6 py-[10vh] font-sans text-ink">
      <section className="mx-auto max-w-xl rounded-[10px] bg-washi/90 p-6" role="alert" aria-labelledby="room-unavailable-title">
        <span className="text-xs text-muted">本地房间</span>
        <h1 id="room-unavailable-title" className="font-serif text-xl font-semibold">这间房打不开</h1>
        <p className="leading-relaxed [overflow-wrap:anywhere]">{message}</p>
        <a className="text-moss-deep" href="/room">回到房间列表</a>
      </section>
    </main>
  );
}

function routeErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    const data = error.data as { error?: unknown } | undefined;
    if (typeof data?.error === 'string') return data.error;
    return `${error.status} ${error.statusText}`.trim();
  }
  return error instanceof Error ? error.message : 'The local Room service did not respond.';
}
