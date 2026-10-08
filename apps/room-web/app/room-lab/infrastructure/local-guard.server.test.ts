import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertLocalRuntime, assertSameOriginForm, assertSameOriginJson } from './local-guard.server';

const publicOrigin = 'https://room.example.com';

function request(origin?: string): Request {
  return new Request('http://127.0.0.1:3210/room/example', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin === undefined ? {} : { Origin: origin }),
    },
    body: '{}',
  });
}

describe('authenticated tunnel origin', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps remote origins rejected unless explicitly configured', () => {
    vi.stubEnv('ROOM_PUBLIC_ORIGIN', '');
    expect(() => assertSameOriginJson(request(publicOrigin))).toThrow(
      'Room actions require a same-origin browser request',
    );
    expect(() => assertSameOriginJson(request('http://127.0.0.1:3210'))).not.toThrow();
    expect(() => assertSameOriginForm(request())).not.toThrow();
  });

  it('allows the configured HTTPS origin for JSON and form mutations', () => {
    vi.stubEnv('ROOM_PUBLIC_ORIGIN', publicOrigin);
    expect(() => assertSameOriginJson(request(publicOrigin))).not.toThrow();
    expect(() => assertSameOriginForm(request(publicOrigin))).not.toThrow();
    expect(() => assertSameOriginJson(request('http://localhost:3210'))).not.toThrow();
  });

  it.each([
    undefined,
    'null',
    'https://attacker.example',
    'https://room.example.com.attacker.example',
    'https://room.example.com:444',
    'http://room.example.com',
  ])('rejects a missing or different origin: %s', (origin) => {
    vi.stubEnv('ROOM_PUBLIC_ORIGIN', publicOrigin);
    expect(() => assertSameOriginJson(request(origin))).toThrow('Room actions require a same-origin browser request');
    expect(() => assertSameOriginForm(request(origin))).toThrow('Room actions require a same-origin browser request');
  });

  it.each([
    'http://room.example.com',
    'https://room.example.com/',
    'https://room.example.com/path',
    'https://room.example.com?query=1',
    'https://room.example.com#fragment',
    'https://user:password@room.example.com',
    'not-a-url',
  ])('does not admit malformed public-origin configuration: %s', (configured) => {
    vi.stubEnv('ROOM_PUBLIC_ORIGIN', configured);
    expect(() => assertSameOriginJson(request(configured))).toThrow(
      'Room actions require a same-origin browser request',
    );
  });

  it('allows an explicitly configured nondefault HTTPS port', () => {
    vi.stubEnv('ROOM_PUBLIC_ORIGIN', 'https://room.example.com:8443');
    expect(() => assertSameOriginJson(request('https://room.example.com:8443'))).not.toThrow();
    expect(() => assertSameOriginJson(request(publicOrigin))).toThrow(
      'Room actions require a same-origin browser request',
    );
  });

  it('still rejects non-JSON actions from the configured origin', () => {
    vi.stubEnv('ROOM_PUBLIC_ORIGIN', publicOrigin);
    const action = request(publicOrigin);
    action.headers.set('Content-Type', 'text/plain');
    expect(() => assertSameOriginJson(action)).toThrow('Room actions require application/json');
  });

  it('does not enable a production runtime without the local runtime opt-in', () => {
    vi.stubEnv('ROOM_PUBLIC_ORIGIN', publicOrigin);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ROOM_LAB_LOCAL', '');
    vi.stubEnv('VERCEL', '');
    expect(() => assertLocalRuntime()).toThrow('Room flight deck is local-only');
    vi.stubEnv('ROOM_LAB_LOCAL', '1');
    expect(() => assertLocalRuntime()).not.toThrow();
    vi.stubEnv('VERCEL', '1');
    expect(() => assertLocalRuntime()).toThrow('Room flight deck is local-only');
  });
});
