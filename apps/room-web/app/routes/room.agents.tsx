import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { isRouteErrorResponse, useLoaderData, useRouteError } from '@remix-run/react';
import { getRoomLabHost } from '../room-lab/composition.server';
import { AgentDesk } from '../room-lab/presentation/AgentDesk';
import {
  LocalRequestError,
  assertLocalRuntime,
  noStoreHeaders,
} from '../room-lab/infrastructure/local-guard.server';

export async function loader(_args: LoaderFunctionArgs) {
  try {
    assertLocalRuntime();
    return json(getRoomLabHost().agentDesk(), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof LocalRequestError) {
      throw json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    throw error;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    assertLocalRuntime();
    const origin = request.headers.get('Origin');
    if (origin && !origin.startsWith('http://127.0.0.1') && !origin.startsWith('http://localhost')) {
      throw new LocalRequestError(403, 'Room actions require a same-origin browser request');
    }
    getRoomLabHost().refreshInventory();
    return json(getRoomLabHost().agentDesk(), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof LocalRequestError) {
      throw json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    throw error;
  }
}

export default function AgentDeskRoute() {
  return <AgentDesk desk={useLoaderData<typeof loader>()} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? (typeof (error.data as { error?: unknown })?.error === 'string'
      ? (error.data as { error: string }).error
      : `${error.status} ${error.statusText}`.trim())
    : error instanceof Error ? error.message : '本地房间暂不可用';
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4 py-12 font-sans text-ink">
      <section className="w-[min(560px,100%)]">
        <h1 className="font-serif text-xl font-semibold">智能体管理暂不可用</h1>
        <p className="leading-relaxed [overflow-wrap:anywhere]">{message}</p>
      </section>
    </main>
  );
}
