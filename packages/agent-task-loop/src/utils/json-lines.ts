/**
 * The JSON value of each non-empty line of an agent's output, last line first.
 * A line that is not valid JSON is skipped; any other value, `null` included,
 * is kept, so callers check the shape they need.
 */
export function jsonLinesLastFirst(output: string): unknown[] {
  const values: unknown[] = [];
  const lines = output.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!.trim();
    if (!line) {
      continue;
    }
    try {
      values.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return values;
}
