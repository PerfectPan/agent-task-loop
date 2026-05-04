export function expandPath(path: string, home: string): string {
  if (path === "~") {
    return home;
  }
  if (path.startsWith("~/")) {
    return `${home}${path.slice(1)}`;
  }
  return path;
}

export function trimTrailingSeparators(value: string): string {
  return value.replace(/[\\/]+$/u, "");
}
