/**
 * The two capitals in a member's mark, derived from its id rather than kept in
 * a name table, so no registry update is needed for a new id. A hyphenated or
 * dotted id gives one letter per part (`claude-code` → CC); a single word
 * gives its first two letters (`dsh` → DS, `opencode` → OP).
 */
export function agentLetters(id: string): string {
  const parts = id.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = parts.length >= 2
    ? `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`
    : (parts[0] ?? id).slice(0, 2);
  return letters.toUpperCase();
}
