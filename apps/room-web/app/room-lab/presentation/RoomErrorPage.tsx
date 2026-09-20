import { isRouteErrorResponse } from 'react-router';

/**
 * What a thrown route response actually said, preferring the message the Room
 * action put in the body over the bare status line.
 */
export function routeErrorMessage(error: unknown, fallback: string): string {
  if (isRouteErrorResponse(error)) {
    const body = error.data as { error?: unknown } | undefined;
    if (typeof body?.error === 'string') return body.error;
    return `${error.status} ${error.statusText}`.trim();
  }
  return error instanceof Error ? error.message : fallback;
}

/** The full-page frame every Room error boundary sits in. */
export function RoomErrorPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12 font-sans text-foreground">
      {children}
    </main>
  );
}
