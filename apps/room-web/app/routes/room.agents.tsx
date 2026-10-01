import {
  data,
  useActionData,
  useLoaderData,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from 'react-router';
import { formText } from '../lib/form';
import { getRoomLabHost } from '../room-lab/composition.server';
import { AgentDesk } from '../room-lab/presentation/agent-desk';
import { RoomInputError } from '../room-lab/application/room-service.server';
import { roomActionMessage, roomActionStatus } from '../room-lab/application/room-error';
import {
  LocalRequestError,
  assertLocalRuntime,
  assertSameOriginForm,
  noStoreHeaders,
} from '../room-lab/infrastructure/local-guard.server';
import { RoomErrorPage, routeErrorMessage } from '../room-lab/presentation/room-error-page';
import type { AgentDeskView } from '../room-lab/read-model';
import { copy } from '../room-lab/copy';

/** Single fetch reads response headers off this export, not off the loader. */
export const headers: HeadersFunction = () => noStoreHeaders;

export async function loader(_args: LoaderFunctionArgs) {
  try {
    assertLocalRuntime();
    return data(await getRoomLabHost().agentDesk(), { headers: noStoreHeaders });
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
    assertSameOriginForm(request);
    const host = getRoomLabHost();
    const form = await request.formData();
    const intent = formText(form, 'intent', 'scan');
    if (intent === 'save-prompt') {
      const agentId = formText(form, 'agentId');
      if (!host.agents.has(agentId)) {
        throw new RoomInputError('Unknown agent');
      }
      host.saveSystemPrompt(agentId, formText(form, 'systemPrompt'));
      return data<AgentDeskView>(await host.agentDesk(), { headers: noStoreHeaders });
    }
    if (intent === 'add-agent') {
      await host.addAgent({
        id: formText(form, 'id'),
        label: formText(form, 'label'),
        ...(formText(form, 'role').trim() ? { role: formText(form, 'role') } : {}),
        command: formText(form, 'command'),
      });
      return data<AgentDeskView>(await host.agentDesk(), { headers: noStoreHeaders });
    }
    await host.refreshInventory();
    return data<AgentDeskView>(await host.agentDesk(), { headers: noStoreHeaders });
  } catch (error) {
    // A guard failure is the page's problem and goes to the boundary; anything
    // the desk itself refused comes back to the form with its own status.
    if (error instanceof LocalRequestError) {
      throw data({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    return data({ error: roomActionMessage(error) }, { status: roomActionStatus(error), headers: noStoreHeaders });
  }
}

export default function AgentDeskRoute() {
  const desk = useActionData<typeof action>();
  const loaded = useLoaderData<typeof loader>();
  // A desk payload replaces the view; an error lands next to the form that caused it.
  return (
    <AgentDesk
      desk={desk && 'agents' in desk ? desk : loaded}
      error={desk && 'error' in desk ? desk.error : undefined}
    />
  );
}

export function ErrorBoundary() {
  const message = routeErrorMessage(useRouteError(), copy.say.agentsUnavailable);
  return (
    <RoomErrorPage>
      <section className="w-[min(480px,100%)]" role="alert">
        <h1 className="m-0 text-2xl font-bold tracking-[-0.02em]">{copy.say.agentsUnavailable}</h1>
        <p className="leading-relaxed text-foreground/75 [overflow-wrap:anywhere]">{message}</p>
      </section>
    </RoomErrorPage>
  );
}
