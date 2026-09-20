import type { RoomLabAgentId } from '../read-model';
import { agentLetters } from './agent-letters';
import { copy } from '../copy';
import { agentTile } from './agent-color';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';

/**
 * One round mark per member: two capitals in that member's hue on a tile of the
 * same hue at 15%. Identity lives in --chart-1…5, which the member's row
 * carries, so the ramp belongs to shadcn and the assignment belongs to the
 * database — not to a table of names in this source. The letters clear 4.5:1
 * against their own tile in both themes, so the mark is self-sufficient
 * wherever it lands. Identity is never read as state; state lives in the dot
 * beside the name.
 */

/** 11px letters at 30px and above, 10px on the 22px mark in the lists. */
const letterSize = (size: number) => (size <= 22 ? 'text-[10px]' : 'text-[11px]');

export function AgentMark({ agentId, color, size = 30, className = '' }: {
  agentId: RoomLabAgentId;
  color: number | undefined;
  size?: number;
  className?: string;
}) {
  const letters = agentLetters(agentId);
  const tile = agentTile(color);
  return (
    <Avatar aria-hidden="true" className={`shrink-0 ${className}`} style={{ width: size, height: size }}>
      <AvatarFallback className={`${tile} ${letterSize(size)} font-semibold tracking-[0.02em]`}>
        {letters}
      </AvatarFallback>
    </Avatar>
  );
}

/** The person in the room: solid ink, the sheet's own colour written on it. */
export function HumanMark({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <Avatar aria-hidden="true" className={`shrink-0 ${className}`} style={{ width: size, height: size }}>
      <AvatarFallback className={`bg-foreground text-background ${letterSize(size)} font-semibold`}>
        {copy.label.humanMark}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The product mark: two offset sine strokes, a stream seen from above. Sits
 * before the wordmark on the rail, the create page and the agent desk.
 */
export function RiverMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 text-primary ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9c3-3 6-3 9 0s6 3 9 0" />
      <path d="M3 15c3-3 6-3 9 0s6 3 9 0" />
    </svg>
  );
}
