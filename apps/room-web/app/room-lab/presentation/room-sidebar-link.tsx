import { Link } from 'react-router';
import type { RoomCatalogItemView } from '../read-model';
import { formatAgo } from './format-time';
import { copy } from '../copy';

/** One room row: its title, how many sit in it, and when it last moved. */
export function RoomSidebarLink({
  room,
  currentRoomId,
  privateRoom,
}: {
  room: RoomCatalogItemView;
  currentRoomId: string;
  /** A room nested under its parent reads a touch quieter than the room itself. */
  privateRoom?: boolean;
}) {
  return (
    <Link
      to={`/room/${room.id}`}
      prefetch="intent"
      preventScrollReset
      aria-current={room.id === currentRoomId ? 'page' : undefined}
      className="block rounded-md px-2 py-1.5 text-sidebar-foreground/75 no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-foreground max-[640px]:whitespace-nowrap"
    >
      <span
        className={`${privateRoom ? 'text-[13px]' : 'text-sm'} block leading-snug [overflow-wrap:anywhere] max-[640px]:inline`}
      >
        {room.title}
      </span>
      {/* Relative time is read off the clock at render; the server and the
          browser render seconds apart, so the two strings may differ. */}
      <span
        className="mt-0.5 block text-xs leading-tight text-muted-foreground max-[640px]:hidden"
        suppressHydrationWarning
      >
        {copy.label.memberCount(room.memberCount)} · {formatAgo(room.updatedAt)}
      </span>
    </Link>
  );
}
