import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import {
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useRouteError,
} from '@remix-run/react';
import { getRoomLabHost } from '../room-lab/composition.server';
import { AgentDesk } from '../room-lab/presentation/AgentDesk';
import { isRoomLabAgentId } from '../room-lab/domain/agent-roster';
import { RoomLabInputError } from '../room-lab/application/room-lab-service.server';
import {
  LocalRequestError,
  assertLocalRuntime,
  noStoreHeaders,
} from '../room-lab/infrastructure/local-guard.server';
import type { AgentDeskView } from '../room-lab/read-model';

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
    const host = getRoomLabHost();
    const form = await request.formData();
    const intent = String(form.get('intent') ?? 'scan');
    if (intent === 'save-prompt') {
      const agentId = form.get('agentId');
      if (!isRoomLabAgentId(agentId)) throw new RoomLabInputError('Unknown agent');
      host.saveSystemPrompt(agentId, String(form.get('systemPrompt') ?? ''));
      return json<AgentDeskView>(host.agentDesk(), { headers: noStoreHeaders });
    }
    host.refreshInventory();
    return json<AgentDeskView>(host.agentDesk(), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof LocalRequestError) {
      throw json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof RoomLabInputError) {
      return json({ error: error.message }, { status: 400, headers: noStoreHeaders });
    }
    throw error;
  }
}

export default function AgentDeskRoute() {
  const desk = useActionData<typeof action>();
  const loaded = useLoaderData<typeof loader>();
  return <AgentDesk desk={desk && 'agents' in desk ? desk : loaded} />;
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
