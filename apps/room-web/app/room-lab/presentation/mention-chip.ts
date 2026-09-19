import { agentDot, agentTile, NEUTRAL_DOT, NEUTRAL_TILE } from './agent-color';
import { agentLetters } from './agent-letters';

/**
 * One description of a mention chip, read by three places that cannot share a
 * React component: the Tiptap node's `renderHTML` (which emits a DOM spec, not
 * JSX), the read-only chip in a posted message, and the suggestion list. A chip
 * in the composer and a chip in the transcript are the same object at different
 * moments, so they must not be styled twice.
 *
 * A chip is built from the id and the colour on that member's row. An id with
 * no row — a member removed since the message was posted — keeps the neutral
 * accent pair, so it still reads as a mention without claiming an identity.
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

export const ALL_MENTION_CHIP: MentionChip = {
  letters: '@',
  text: 'all',
  chipClass: `${CHIP} ${NEUTRAL_TILE}`,
  dotClass: `${DOT} ${NEUTRAL_DOT}`,
};

export function mentionChip(id: string, color?: number): MentionChip {
  if (id === 'all') return ALL_MENTION_CHIP;
  return {
    letters: agentLetters(id),
    text: id,
    chipClass: `${CHIP} ${agentTile(color)}`,
    dotClass: `${DOT} ${agentDot(color)}`,
  };
}
