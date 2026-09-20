import {
  data,
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from 'react-router';
import { getRoomLabHost } from '../room-lab/composition.server';
import { AgentDesk } from '../room-lab/presentation/AgentDesk';
import { RoomLabInputError } from '../room-lab/application/room-lab-service.server';
import {
  LocalRequestError,
  assertLocalRuntime,
  noStoreHeaders,
} from '../room-lab/infrastructure/local-guard.server';
import type { AgentDeskView } from '../room-lab/read-model';
import { copy } from '../room-lab/copy';

/** Single fetch reads response headers off this export, not off the loader. */
export const headers: HeadersFunction = () => noStoreHeaders;

export async function loader(_args: LoaderFunctionArgs) {
  try {
    assertLocalRuntime();
    return data(getRoomLabHost().agentDesk(), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof LocalRequestError) {
      throw data({ error: error.message }, { status: error.status, headers: noStoreHeaders });
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
      const agentId = String(form.get('agentId') ?? '');
      if (!host.agents.has(agentId)) throw new RoomLabInputError('Unknown agent');
      host.saveSystemPrompt(agentId, String(form.get('systemPrompt') ?? ''));
      return data<AgentDeskView>(host.agentDesk(), { headers: noStoreHeaders });
    }
    host.refreshInventory();
    return data<AgentDeskView>(host.agentDesk(), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof LocalRequestError) {
      throw data({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof RoomLabInputError) {
      return data({ error: error.message }, { status: 400, headers: noStoreHeaders });
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
    : error instanceof Error ? error.message : copy.say.agentsUnavailable;
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12 font-sans text-foreground">
      <section className="w-[min(480px,100%)]" role="alert">
        <h1 className="m-0 text-2xl font-bold tracking-[-0.02em]">{copy.say.agentsUnavailable}</h1>
        <p className="leading-relaxed text-foreground/75 [overflow-wrap:anywhere]">{message}</p>
      </section>
    </main>
  );
}
