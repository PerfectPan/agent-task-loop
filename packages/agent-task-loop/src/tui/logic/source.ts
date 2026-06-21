/**
 * Compact, list-friendly label for a task source.
 *
 * - `feishu` stays `feishu`
 * - `github:<owner>/<repo>` collapses to the repo short name (`<repo>`), which
 *   is what distinguishes repos in a narrow list column; the full
 *   `github:owner/repo` still appears in the detail pane.
 * - anything else is shown verbatim.
 */
export function sourceLabel(source: string | undefined): string {
  if (!source) {
    return '—';
  }
  if (source.startsWith('github:')) {
    const rest = source.slice('github:'.length);
    const slash = rest.lastIndexOf('/');
    return slash >= 0 ? rest.slice(slash + 1) : rest;
  }
  return source;
}

/** One selectable source row: id, its compact label, and how many tasks it holds. */
export interface SourceOption {
  id: string;
  label: string;
  count: number;
}

/**
 * Builds the ordered source list for the filter picker. Configured sources come
 * first (in the given order) so empty backends still appear; any extra source
 * seen on a task but not configured is appended. Each carries its task count.
 */
export function buildSourceOptions(
  tasks: ReadonlyArray<{ source?: string }>,
  configured: readonly string[] = [],
): SourceOption[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const id = task.source ?? '';
    if (!id) {
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const id of configured) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  for (const id of counts.keys()) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  return ordered.map(id => ({ id, label: sourceLabel(id), count: counts.get(id) ?? 0 }));
}
