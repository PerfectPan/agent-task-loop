export const noStoreHeaders = { 'Cache-Control': 'no-store' };

export class LocalRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'LocalRequestError';
  }
}

export function assertLocalRuntime(): void {
  if (
    process.env.VERCEL ||
    (process.env.NODE_ENV === 'production' && process.env.ROOM_LAB_LOCAL !== '1')
  ) {
    throw new LocalRequestError(403, 'Room flight deck is local-only');
  }
}

export function assertSameOriginJson(request: Request): void {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new LocalRequestError(415, 'Room actions require application/json');
  }
  const origin = request.headers.get('Origin');
  if (!origin || !isLocalOrigin(origin)) {
    throw new LocalRequestError(403, 'Room actions require a same-origin browser request');
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
