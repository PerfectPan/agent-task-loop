export const noStoreHeaders = { 'Cache-Control': 'no-store' };

export class LocalRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LocalRequestError';
  }
}

export function assertLocalRuntime(): void {
  if (process.env.VERCEL || (process.env.NODE_ENV === 'production' && process.env.ROOM_LAB_LOCAL !== '1')) {
    throw new LocalRequestError(403, 'Room flight deck is local-only');
  }
}

export function assertSameOriginJson(request: Request): void {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new LocalRequestError(415, 'Room actions require application/json');
  }
  assertSameOrigin(request);
}

/**
 * A form post carries no `Content-Type` this app chose, so only the origin can
 * be checked. Browsers omit `Origin` on some same-origin form posts, which is
 * why a missing header is allowed for local-only forms. An authenticated
 * remote entry still needs Origin validation to prevent cross-site mutations.
 */
export function assertSameOriginForm(request: Request): void {
  const origin = request.headers.get('Origin');
  if (origin || process.env.ROOM_PUBLIC_ORIGIN) {
    assertSameOrigin(request);
  }
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  if (!origin || (!isLocalOrigin(origin) && !isConfiguredPublicOrigin(origin))) {
    throw new LocalRequestError(403, 'Room actions require a same-origin browser request');
  }
}

function isConfiguredPublicOrigin(origin: string): boolean {
  const configured = process.env.ROOM_PUBLIC_ORIGIN;
  if (!configured || origin !== configured) {
    return false;
  }
  try {
    const url = new URL(configured);
    return url.protocol === 'https:' && url.origin === configured;
  } catch {
    return false;
  }
}

export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}
