import {
  data,
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from 'react-router';
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
import { copy } from '../room-lab/presentation/copy';
import {
  LocalRequestError,
  assertLocalRuntime,
  assertSameOriginJson,
  noStoreHeaders,
} from '../room-lab/infrastructure/local-guard.server';

/**
 * Single fetch builds every response's headers from the route's `headers`
 * export; a loader's own init headers only survive as cookies. Re-export
 * no-store here so Room state stays uncached on document and .data alike.
 */
export const headers: HeadersFunction = () => noStoreHeaders;

export async function loader({ params }: LoaderFunctionArgs) {
  try {
    assertLocalRuntime();
    const roomId = params.roomId;
    if (!roomId || !isRoomIdentity(roomId)) {
      throw new LocalRequestError(404, 'Unknown Room');
    }
    return data(await getRoomLabHost().snapshot(roomId), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof RoomCatalogInvariantError) {
      throw data({ error: error.message }, { status: 404, headers: noStoreHeaders });
    }
    if (error instanceof LocalRequestError) {
      throw data({ error: error.message }, { status: error.status, headers: noStoreHeaders });
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
      return data<RoomLabActionResponse>({ ok: true, state: created }, { headers: noStoreHeaders });
    }
    const state = await host.act(roomId, input, request.signal);
    return data<RoomLabActionResponse>({ ok: true, state }, { headers: noStoreHeaders });
  } catch (error) {
    const status = error instanceof RoomLabBusyError
      ? 409
      : error instanceof RoomLabInputError || error instanceof RoomCatalogInvariantError
        ? 400
        : error instanceof LocalRequestError
          ? error.status
          : 500;
    const message = error instanceof Error ? error.message : 'Room action failed';
    return data<RoomLabActionResponse>(
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
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12 font-sans text-foreground">
      <section className="shadow-card w-[min(480px,100%)] rounded-lg border border-input bg-card p-6" role="alert" aria-labelledby="room-unavailable-title">
        <h1 id="room-unavailable-title" className="m-0 text-2xl font-bold tracking-[-0.02em]">{copy.say.roomUnavailable}</h1>
        <p className="leading-relaxed text-foreground/75 [overflow-wrap:anywhere]">{message}</p>
        <a className="text-primary" href="/room">{copy.action.backToRooms}</a>
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
