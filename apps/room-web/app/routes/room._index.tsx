import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from 'react-router';
import { getRoomLabHost } from '../room-lab/composition.server';
import { roomActionMessage, roomActionStatus } from '../room-lab/application/room-error';
import {
  LocalRequestError,
  assertLocalRuntime,
  assertSameOriginForm,
  noStoreHeaders,
} from '../room-lab/infrastructure/local-guard.server';
import { RoomErrorPage, routeErrorMessage } from '../room-lab/presentation/RoomErrorPage';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Wordmark } from '../room-lab/presentation/AgentMark';
import { copy } from '../room-lab/copy';
import { Button } from '../components/ui/button';

/** Single fetch reads response headers off this export, not off the loader. */
export const headers: HeadersFunction = () => noStoreHeaders;

export async function loader(_args: LoaderFunctionArgs) {
  try {
    assertLocalRuntime();
  } catch (error) {
    if (error instanceof LocalRequestError) {
      throw data({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    throw error;
  }
  const last = getRoomLabHost().lastOpened();
  if (last) return redirect(`/room/${last.id}`);
  return data({ empty: true as const }, { headers: noStoreHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    assertLocalRuntime();
    assertSameOriginForm(request);
    const form = await request.formData();
    const goal = String(form.get('goal') ?? '');
    const created = await getRoomLabHost().create({
      title: String(form.get('title') ?? ''),
      ...(goal.trim() ? { goal } : {}),
    });
    return redirect(`/room/${created.roomId}`);
  } catch (error) {
    return data(
      { ok: false as const, error: roomActionMessage(error) },
      { status: roomActionStatus(error), headers: noStoreHeaders },
    );
  }
}

export default function RoomHome() {
  const actionData = useActionData<typeof action>();
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12 font-sans text-foreground">
      <section className="shadow-card w-[min(480px,100%)] rounded-lg border border-input bg-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <Wordmark />
        </div>
        <h1 className="m-0 mb-1.5 text-2xl font-bold leading-tight tracking-[-0.02em]">{copy.say.createTitle}</h1>
        <p className="m-0 mb-5 text-sm leading-relaxed text-foreground/75">
          {copy.say.createIntro}
        </p>
        <Form method="post" className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            {copy.label.roomName}
            <Input name="title" required maxLength={80} placeholder={copy.label.roomNamePlaceholder} autoFocus />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>{copy.label.goal} <span className="ml-1 text-xs text-muted-foreground">{copy.label.optional}</span></span>
            <Textarea name="goal" maxLength={400} rows={3} placeholder={copy.label.goalPlaceholder} />
          </label>
          <p data-error className="m-0 min-h-4 text-xs text-destructive" role={actionData && !actionData.ok ? 'alert' : undefined}>
            {actionData && !actionData.ok ? actionData.error : ''}
          </p>
          <Button type="submit" className="self-start">{copy.action.createRoom}</Button>
        </Form>
        <p className="mt-5 mb-0 text-xs text-muted-foreground">
          <Link className="text-primary" to="/room/agents">{copy.label.agents}</Link>
          ：{copy.say.agentsLink}
        </p>
      </section>
    </main>
  );
}

export function ErrorBoundary() {
  const message = routeErrorMessage(useRouteError(), copy.say.serviceUnavailable);
  return (
    <RoomErrorPage>
      <section className="w-[min(480px,100%)]" role="alert">
        <h1 className="m-0 text-2xl font-bold tracking-[-0.02em]">{copy.say.serviceUnavailable}</h1>
        <p className="leading-relaxed text-foreground/75 [overflow-wrap:anywhere]">{message}</p>
      </section>
    </RoomErrorPage>
  );
}
