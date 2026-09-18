import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { describe, expect, it } from 'vitest';
import { action, loader } from '../../routes/room';

describe('Room action boundary', () => {
  it('rejects a cross-origin JSON mutation', async () => {
    const response = await action(args(new Request('http://127.0.0.1:3210/room', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker.example',
      },
      body: JSON.stringify({ action: 'reset' }),
    })));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Room actions require a same-origin browser request',
    });
  });

  it('rejects form submissions before parsing the action', async () => {
    const response = await action(args(new Request('http://127.0.0.1:3210/room', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'http://127.0.0.1:3210',
      },
      body: 'action=reset',
    })));

    expect(response.status).toBe(415);
  });

  it('rejects malformed JSON payloads as a client error', async () => {
    const response = await action(args(new Request('http://127.0.0.1:3210/room', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:3210',
      },
      body: JSON.stringify({ action: 'task', title: 42 }),
    })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Room action payload is invalid',
    });
  });

  it('returns an explicit 403 response when the loader is not local', async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = '1';
    try {
      const rejected = loader(loaderArgs(new Request('http://127.0.0.1:3210/room')));
      await expect(rejected).rejects.toMatchObject({ status: 403 });
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });
});

function args(request: Request): ActionFunctionArgs {
  return { request, params: {}, context: {} };
}

function loaderArgs(request: Request): LoaderFunctionArgs {
  return { request, params: {}, context: {} };
}
