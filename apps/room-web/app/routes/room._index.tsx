import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import {
  Form,
  isRouteErrorResponse,
  useActionData,
  useRouteError,
} from '@remix-run/react';
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
import styles from '../room-lab/presentation/RoomHome.module.css';

export async function loader(_args: LoaderFunctionArgs) {
  try {
    assertLocalRuntime();
  } catch (error) {
    if (error instanceof LocalRequestError) {
      throw json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    throw error;
  }
  const last = getRoomLabHost().lastOpened();
  if (last) return redirect(`/room/${last.id}`);
  return json({ empty: true as const }, { headers: noStoreHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    assertLocalRuntime();
    const created = await createRoomFromRequest(request);
    if (wantsJson(request)) {
      return json({ ok: true as const, redirectTo: `/room/${created.roomId}` }, { headers: noStoreHeaders });
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
    return json({ ok: false as const, error: message }, { status, headers: noStoreHeaders });
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
    <main className={styles.home}>
      <section>
        <img className={styles.mark} src="/images/spirit.png" width={64} height={64} alt="" />
        <p>本地房间</p>
        <h1>建一间房，把要做的事写在名字上。</h1>
        <p className={styles.lead}>
          人和本地 Agent 在同一条时间线里讨论、写作、推进任务。
        </p>
        <Form method="post">
          <label>
            房间名
            <input name="title" required maxLength={80} placeholder="例如：Q3 定价方案" autoFocus />
          </label>
          <label>
            这间房要完成什么 <span>可选</span>
            <textarea name="goal" maxLength={400} rows={3} placeholder="一句话就够，之后还能改。" />
          </label>
          <p data-error className={styles.error}>
            {actionData && !actionData.ok ? actionData.error : ''}
          </p>
          <button type="submit">建房间</button>
        </Form>
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
    : error instanceof Error ? error.message : '本地房间暂不可用';
  return (
    <main className={styles.home}>
      <section>
        <h1>本地房间暂不可用</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
