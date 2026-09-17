import type { MentionId } from './composer-doc';

/**
 * One description of a mention chip, read by three places that cannot share a
 * React component: the Tiptap node's `renderHTML` (which emits a DOM spec, not
 * JSX), the read-only chip in a posted message, and the suggestion list. A chip
 * in the composer and a chip in the transcript are the same object at different
 * moments, so they must not be styled twice.
 *
 * The classes are written out one per member because Tailwind resolves colours
 * by scanning the source for literal class names.
 */
export interface MentionChip {
  /** Two capitals in the dot; `@all` is the room rather than a member. */
  letters: string;
  /** The word after the dot. */
  text: string;
  chipClass: string;
  dotClass: string;
}

const CHIP = 'inline-flex items-center gap-1 rounded-full px-1.5 align-baseline font-sans text-[15px] leading-normal font-semibold';
const DOT = 'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-[8px] leading-none font-semibold';

export const MENTION_CHIPS: Record<MentionId, MentionChip> = {
  all: {
    letters: '@',
    text: 'all',
    chipClass: `${CHIP} bg-accent text-accent-foreground`,
    dotClass: `${DOT} bg-accent-foreground text-accent`,
  },
  'claude-relay': {
    letters: 'CR',
    text: 'claude-relay',
    chipClass: `${CHIP} bg-chart-1/15 text-chart-1`,
    dotClass: `${DOT} bg-chart-1 text-background`,
  },
  claude: {
    letters: 'CL',
    text: 'claude',
    chipClass: `${CHIP} bg-chart-2/15 text-chart-2`,
    dotClass: `${DOT} bg-chart-2 text-background`,
  },
  codex: {
    letters: 'CX',
    text: 'codex',
    chipClass: `${CHIP} bg-chart-3/15 text-chart-3`,
    dotClass: `${DOT} bg-chart-3 text-background`,
  },
  opencode: {
    letters: 'OC',
    text: 'opencode',
    chipClass: `${CHIP} bg-chart-4/15 text-chart-4`,
    dotClass: `${DOT} bg-chart-4 text-background`,
  },
  dsh: {
    letters: 'DS',
    text: 'dsh',
    chipClass: `${CHIP} bg-chart-5/15 text-chart-5`,
    dotClass: `${DOT} bg-chart-5 text-background`,
  },
};

export function isMentionId(value: unknown): value is MentionId {
  return typeof value === 'string' && value in MENTION_CHIPS;
}

export function mentionChip(id: string): MentionChip | undefined {
  return isMentionId(id) ? MENTION_CHIPS[id] : undefined;
}
