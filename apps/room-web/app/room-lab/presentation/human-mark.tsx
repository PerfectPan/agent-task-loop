import { copy } from '../copy';
import { markLetterSize } from './mark-letter-size';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';

/** The person in the room: solid ink, the sheet's own colour written on it. */
export function HumanMark({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <Avatar aria-hidden="true" className={`shrink-0 ${className}`} style={{ width: size, height: size }}>
      <AvatarFallback className={`bg-foreground text-background ${markLetterSize(size)} font-semibold`}>
        {copy.label.humanMark}
      </AvatarFallback>
    </Avatar>
  );
}
