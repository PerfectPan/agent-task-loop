export type FailureMessageFormatter = (
  error: unknown,
  neutralMessage: string,
) => string;

export function formatFailureMessage(
  formatter: FailureMessageFormatter | undefined,
  error: unknown,
  neutralMessage: string,
): string {
  if (formatter) {
    return formatter(error, neutralMessage);
  }
  return error instanceof Error ? error.message : String(error);
}
