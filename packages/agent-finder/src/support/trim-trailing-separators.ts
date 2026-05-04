export function trimTrailingSeparators(value: string): string {
  return value.replace(/[\\/]+$/u, "");
}
