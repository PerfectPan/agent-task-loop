import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { RoomCatalogItemView } from '../read-model';
import { RiverMark } from './AgentMark';
import { formatAgo } from './format-time';
import { PRODUCT_NAME } from './product';
import { sectionLabel } from './ui';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

const navLink =
  'flex h-7 items-center justify-between gap-2 rounded-md px-2 text-sm text-sidebar-foreground/75 no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-foreground';

type ThemeChoice = 'light' | 'dark' | undefined;
const THEME_KEY = 'rivus-theme';
const themeLabels = { system: '跟随系统', light: '亮色', dark: '暗色' } as const;

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

/** shadcn switches on a `dark` class, so 跟随系统 has to resolve the query itself. */
function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark'
    || (choice === undefined && window.matchMedia(SYSTEM_DARK).matches);
  document.documentElement.classList.toggle('dark', dark);
}

/**
 * Three states, one text action: follow the system, force light, force dark.
 * The choice is written to the same key the inline script in root.tsx reads
 * before first paint, so a reload does not flash the other theme.
 */
function ThemeAction() {
  const [choice, setChoice] = useState<ThemeChoice>(undefined);
  // Read after mount: the server has no localStorage, and the button's first
  // client render has to match the markup the server sent.
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') setChoice(stored);
  }, []);
  // While following the system there is no media query doing the work for us:
  // the class has to be restamped whenever the system flips.
  useEffect(() => {
    if (choice !== undefined) return;
    const query = window.matchMedia(SYSTEM_DARK);
    const sync = () => applyTheme(undefined);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [choice]);
  const cycle = () => {
    const next: ThemeChoice = choice === undefined ? 'light' : choice === 'light' ? 'dark' : undefined;
    setChoice(next);
    if (next) window.localStorage.setItem(THEME_KEY, next);
    else window.localStorage.removeItem(THEME_KEY);
    applyTheme(next);
  };
  return (
    <Button variant="ghost" size="xs" onClick={cycle}>
      主题：{themeLabels[choice ?? 'system']}
    </Button>
  );
}

export function RoomSidebar({ rooms, currentRoomId, disabled, onCreate }: {
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
  useEffect(() => { if (creating) inputRef.current?.focus(); }, [creating]);

  return (
    <nav
      className="flex min-h-0 flex-col gap-[18px] overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground px-2.5 py-3.5 max-[820px]:flex-row max-[820px]:items-center max-[820px]:gap-4 max-[820px]:overflow-x-auto max-[820px]:border-r-0 max-[820px]:border-b max-[820px]:py-2.5"
      aria-label="房间"
    >
      <div className="flex items-center gap-2 px-2 pt-1 max-[820px]:shrink-0 max-[820px]:pt-0">
        <RiverMark size={18} />
        <strong className="text-sm font-semibold tracking-[-0.01em] leading-none">{PRODUCT_NAME}</strong>
        <span className="text-xs leading-none text-muted-foreground max-[820px]:hidden">本地工作台</span>
      </div>

      <div className="flex flex-col gap-0.5 max-[820px]:flex-row max-[820px]:shrink-0" aria-label="页面">
        <Link
          to={`/room/${currentRoomId}`}
          prefetch="intent"
          preventScrollReset
          aria-current={!onAgents ? 'page' : undefined}
          className={navLink}
        >
          房间
          <span className="tabular-nums text-xs text-muted-foreground">{rooms.length}</span>
        </Link>
        <Link
          to="/room/agents"
          prefetch="intent"
          preventScrollReset
          aria-current={onAgents ? 'page' : undefined}
          className={navLink}
        >
          智能体
        </Link>
      </div>

      <div className="flex min-h-0 flex-col max-[820px]:min-w-0 max-[820px]:flex-1 max-[820px]:flex-row max-[820px]:items-center max-[820px]:gap-2">
        <div className="mb-1 flex h-6 items-center justify-between px-2 max-[820px]:mb-0 max-[820px]:shrink-0 max-[820px]:px-0">
          <h2 className={`${sectionLabel} max-[820px]:hidden`}>房间</h2>
          {!creating && (
            <Button variant="ghost" size="xs" disabled={disabled} onClick={() => setCreating(true)}>
              新建
            </Button>
          )}
        </div>
        {creating && (
          <form
            className="shadow-card mb-2 flex flex-col gap-2 rounded-lg border border-input bg-card p-2 max-[820px]:mb-0 max-[820px]:w-[260px] max-[820px]:shrink-0"
            onSubmit={event => {
              event.preventDefault();
              const next = title.trim();
              if (!next) return;
              onCreate(next);
              setTitle('');
              setCreating(false);
            }}
          >
            <label className="sr-only" htmlFor="new-room-title">房间名</label>
            <Input
              ref={inputRef}
              id="new-room-title"
              value={title}
              maxLength={80}
              placeholder="这间房要做什么"
              onChange={event => setTitle(event.currentTarget.value)}
              onKeyDown={event => { if (event.key === 'Escape') { setCreating(false); setTitle(''); } }}
            />
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="xs" onClick={() => { setCreating(false); setTitle(''); }}>取消</Button>
              <Button type="submit" size="xs" className="px-2.5" disabled={!title.trim() || disabled}>建房间</Button>
            </div>
          </form>
        )}
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 max-[820px]:flex-row max-[820px]:gap-1">
          {rooms.map(room => (
            <li key={room.id} className="max-[820px]:shrink-0">
              <Link
                to={`/room/${room.id}`}
                prefetch="intent"
                preventScrollReset
                aria-current={room.id === currentRoomId ? 'page' : undefined}
                className="block rounded-md px-2 py-1.5 text-sidebar-foreground/75 no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-foreground max-[820px]:whitespace-nowrap"
              >
                <span className="block text-sm leading-snug [overflow-wrap:anywhere] max-[820px]:inline">{room.title}</span>
                {/* Relative time is read off the clock at render; the server and the
                    browser render seconds apart, so the two strings may differ. */}
                <span className="mt-0.5 block text-xs leading-tight text-muted-foreground max-[820px]:hidden" suppressHydrationWarning>
                  {room.memberCount} 位成员 · {formatAgo(room.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-auto flex flex-col items-start gap-0.5 px-0.5 pt-2 text-xs leading-snug text-muted-foreground max-[820px]:hidden">
        <ThemeAction />
        <span className="px-1.5">保存在这台机器上</span>
      </footer>
    </nav>
  );
}
