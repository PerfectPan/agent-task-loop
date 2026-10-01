import type { RoomLabAgentId } from '../read-model';
import { agentLetters } from './agent-letters';
import { agentTile } from './agent-color';
import { markLetterSize } from './mark-letter-size';
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

export function AgentMark({
  agentId,
  color,
  size = 30,
  className = '',
}: {
  agentId: RoomLabAgentId;
  color: number | undefined;
  size?: number;
  className?: string;
}) {
  const letters = agentLetters(agentId);
  const tile = agentTile(color);
  return (
    <Avatar aria-hidden="true" className={`shrink-0 ${className}`} style={{ width: size, height: size }}>
      <AvatarFallback className={`${tile} ${markLetterSize(size)} font-semibold tracking-[0.02em]`}>
        {letters}
      </AvatarFallback>
    </Avatar>
  );
}
