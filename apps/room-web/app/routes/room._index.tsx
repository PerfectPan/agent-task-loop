import {
  Form,
  Link,
  data,
  isRouteErrorResponse,
  redirect,
  useActionData,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from 'react-router';
import { getRoomLabHost } from '../room-lab/composition.server';
import {
  RoomLabBusyError,
  RoomLabInputError,
} from '../room-lab/application/room-lab-service.server';
import { RoomCatalogInvariantError } from '../room-lab/domain/room-catalog';
import {
  LocalRequestError,
  assertLocalRuntime,
  assertSameOriginJson,
  noStoreHeaders,
} from '../room-lab/infrastructure/local-guard.server';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { RiverMark } from '../room-lab/presentation/AgentMark';
import { PRODUCT_NAME } from '../room-lab/presentation/product';
import { copy } from '../room-lab/presentation/copy';
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
    const created = await createRoomFromRequest(request);
    if (wantsJson(request)) {
      return data({ ok: true as const, redirectTo: `/room/${created.roomId}` }, { headers: noStoreHeaders });
    }
    return redirect(`/room/${created.roomId}`);
  } catch (error) {
    const status = error instanceof RoomLabBusyError
      ? 409
      : error instanceof RoomLabInputError || error instanceof RoomCatalogInvariantError
        ? 400
        : error instanceof LocalRequestError
          ? error.status
          : 500;
    const message = error instanceof Error ? error.message : 'Room action failed';
    return data({ ok: false as const, error: message }, { status, headers: noStoreHeaders });
  }
}

async function createRoomFromRequest(request: Request) {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (contentType.startsWith('application/json')) {
    assertSameOriginJson(request);
    const input = await request.json().catch(() => {
      throw new RoomLabInputError('Room action must be valid JSON');
    });
    if (!input || typeof input !== 'object' || input.action !== 'create' || typeof input.title !== 'string') {
      throw new RoomLabInputError('Room action payload is invalid');
    }
    return getRoomLabHost().create({
      title: input.title,
      ...(typeof input.goal === 'string' ? { goal: input.goal } : {}),
    });
  }
  const origin = request.headers.get('Origin');
  if (origin && !origin.startsWith('http://127.0.0.1') && !origin.startsWith('http://localhost')) {
    throw new LocalRequestError(403, 'Room actions require a same-origin browser request');
  }
  const form = await request.formData();
  const title = String(form.get('title') ?? '');
  const goal = String(form.get('goal') ?? '');
  return getRoomLabHost().create({
    title,
    ...(goal.trim() ? { goal } : {}),
  });
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json');
}

export default function RoomHome() {
  const actionData = useActionData<typeof action>();
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12 font-sans text-foreground">
      <section className="shadow-card w-[min(480px,100%)] rounded-lg border border-input bg-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <RiverMark size={18} />
          <strong className="text-sm font-semibold tracking-[-0.01em] leading-none">{PRODUCT_NAME}</strong>
          <span className="text-xs leading-none text-muted-foreground">本地工作台</span>
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
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? (typeof (error.data as { error?: unknown })?.error === 'string'
      ? (error.data as { error: string }).error
      : `${error.status} ${error.statusText}`.trim())
    : error instanceof Error ? error.message : copy.say.serviceUnavailable;
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12 font-sans text-foreground">
      <section className="w-[min(480px,100%)]" role="alert">
        <h1 className="m-0 text-2xl font-bold tracking-[-0.02em]">{copy.say.serviceUnavailable}</h1>
        <p className="leading-relaxed text-foreground/75 [overflow-wrap:anywhere]">{message}</p>
      </section>
    </main>
  );
}
