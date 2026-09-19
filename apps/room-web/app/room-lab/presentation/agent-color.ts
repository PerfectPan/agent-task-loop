/**
 * Identity is `--chart-1…5`, one hue per member, drawn when the member's row is
 * created and stored on it. Three surfaces read the same number: the round mark
 * (letters in the hue on a 15% tile of it), the author name in the transcript,
 * and the dot inside a mention chip.
 *
 * The classes are written out one per hue because Tailwind resolves colours by
 * scanning the source for literal class names; a member whose row carries a
 * colour outside 1…5 falls back to the neutral accent pair.
 */
const TILE = [
  'bg-chart-1/15 text-chart-1',
  'bg-chart-2/15 text-chart-2',
  'bg-chart-3/15 text-chart-3',
  'bg-chart-4/15 text-chart-4',
  'bg-chart-5/15 text-chart-5',
] as const;

const INK = [
  'text-chart-1',
  'text-chart-2',
  'text-chart-3',
  'text-chart-4',
  'text-chart-5',
] as const;

const DOT = [
  'bg-chart-1 text-background',
  'bg-chart-2 text-background',
  'bg-chart-3 text-background',
  'bg-chart-4 text-background',
  'bg-chart-5 text-background',
] as const;

export const NEUTRAL_TILE = 'bg-accent text-accent-foreground';
export const NEUTRAL_INK = 'text-accent-foreground';
export const NEUTRAL_DOT = 'bg-accent-foreground text-accent';

function pick(scale: readonly string[], color: number | undefined, fallback: string): string {
  return (color !== undefined && scale[color - 1]) || fallback;
}

/** The mark and chip surface: the hue at 15% under letters of the same hue. */
export function agentTile(color: number | undefined): string {
  return pick(TILE, color, NEUTRAL_TILE);
}

/** The author name in the transcript. */
export function agentInk(color: number | undefined): string {
  return pick(INK, color, NEUTRAL_INK);
}

/** The solid dot inside a mention chip. */
export function agentDot(color: number | undefined): string {
  return pick(DOT, color, NEUTRAL_DOT);
}
