import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { RoomCatalogItemView } from '../read-model';
import { Wordmark } from './wordmark';
import { sectionLabel } from './ui';
import { copy } from '../copy';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { RoomSidebarLink } from './room-sidebar-link';
import { ThemeAction } from './theme-action';

const navLink =
  'flex h-7 items-center justify-between gap-2 rounded-md px-2 text-sm text-sidebar-foreground/75 no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-foreground';

export function RoomSidebar({
  rooms,
  currentRoomId,
  disabled,
  onCreate,
}: {
  rooms: RoomCatalogItemView[];
  currentRoomId: string;
  disabled: boolean;
  onCreate: (title: string) => void;
}) {
  const location = useLocation();
  const onAgents = location.pathname === '/room/agents';
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (creating) {
      inputRef.current?.focus();
    }
  }, [creating]);
  const roomCount = rooms.reduce((count, room) => count + 1 + (room.children?.length ?? 0), 0);
  return (
    <nav
      className="flex min-h-0 flex-col gap-[18px] overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground px-2.5 py-3.5 max-[640px]:flex-row max-[640px]:items-center max-[640px]:gap-4 max-[640px]:overflow-x-auto max-[640px]:border-r-0 max-[640px]:border-b max-[640px]:py-2.5"
      aria-label={copy.label.rooms}
    >
      <div className="flex items-center gap-2 px-2 pt-1 max-[640px]:shrink-0 max-[640px]:pt-0">
        <Wordmark taglineClassName="max-[640px]:hidden" />
      </div>

      <div className="flex flex-col gap-0.5 max-[640px]:flex-row max-[640px]:shrink-0" aria-label={copy.label.pages}>
        <Link
          to={`/room/${currentRoomId}`}
          prefetch="intent"
          preventScrollReset
          aria-current={!onAgents ? 'page' : undefined}
          className={navLink}
        >
          {copy.label.rooms}
          <span className="tabular-nums text-xs text-muted-foreground">{roomCount}</span>
        </Link>
        <Link
          to="/room/agents"
          prefetch="intent"
          preventScrollReset
          aria-current={onAgents ? 'page' : undefined}
          className={navLink}
        >
          {copy.label.agents}
        </Link>
      </div>

      <div className="flex min-h-0 flex-col max-[640px]:min-w-0 max-[640px]:flex-1 max-[640px]:flex-row max-[640px]:items-center max-[640px]:gap-2">
        <div className="mb-1 flex h-6 items-center justify-between px-2 max-[640px]:mb-0 max-[640px]:shrink-0 max-[640px]:px-0">
          <h2 className={`${sectionLabel} max-[640px]:hidden`}>{copy.label.rooms}</h2>
          {!creating && (
            <Button variant="ghost" size="xs" disabled={disabled} onClick={() => setCreating(true)}>
              {copy.action.newRoom}
            </Button>
          )}
        </div>
        {creating && (
          <form
            className="shadow-card mb-2 flex flex-col gap-2 rounded-lg border border-input bg-card p-2 max-[640px]:mb-0 max-[640px]:w-[260px] max-[640px]:shrink-0"
            onSubmit={(event) => {
              event.preventDefault();
              const next = title.trim();
              if (!next) {
                return;
              }
              onCreate(next);
              setTitle('');
              setCreating(false);
            }}
          >
            <label className="sr-only" htmlFor="new-room-title">
              {copy.label.roomName}
            </label>
            <Input
              ref={inputRef}
              id="new-room-title"
              value={title}
              maxLength={80}
              placeholder={copy.label.roomNamePlaceholder}
              onChange={(event) => setTitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setCreating(false);
                  setTitle('');
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setCreating(false);
                  setTitle('');
                }}
              >
                {copy.action.cancel}
              </Button>
              <Button type="submit" size="xs" className="px-2.5" disabled={!title.trim() || disabled}>
                {copy.action.create}
              </Button>
            </div>
          </form>
        )}
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 max-[640px]:flex-row max-[640px]:gap-1">
          {rooms.map((room) => (
            <li key={room.id} className="max-[640px]:shrink-0">
              <RoomSidebarLink room={room} currentRoomId={currentRoomId} />
              {room.children && room.children.length > 0 && (
                // A private room shows under the room it was opened from, titled
                // by its two members; the person can open and read it like any
                // other room.
                <ul className="m-0 mt-0.5 list-none border-l border-sidebar-border pl-2 max-[640px]:pl-0">
                  {room.children.map((child) => (
                    <li key={child.id} className="max-[640px]:shrink-0">
                      <RoomSidebarLink room={child} currentRoomId={currentRoomId} privateRoom />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-auto flex flex-col items-start gap-0.5 px-0.5 pt-2 text-xs leading-snug text-muted-foreground max-[640px]:hidden">
        <ThemeAction />
        <span className="px-1.5">{copy.say.savedLocally}</span>
      </footer>
    </nav>
  );
}
