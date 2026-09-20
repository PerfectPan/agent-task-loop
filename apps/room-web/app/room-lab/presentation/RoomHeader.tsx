import { useState } from 'react';
import { DotsThree } from '@phosphor-icons/react/dist/ssr/DotsThree';
import { copy } from '../copy';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

export function RoomHeader({
  title, goal, memberCount, sentence, disabled, onMembers, onManage, onReset,
}: {
  title: string; goal?: string; memberCount: number; sentence?: string; disabled: boolean;
  onMembers: () => void; onManage: () => void; onReset: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const closeMenu = () => {
    setMenuOpen(false);
    setConfirming(false);
  };
  return (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border px-7 pt-[22px] pb-3.5">
      <div className="min-w-0">
        <h1 id="room-heading" className="m-0 text-2xl font-bold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">{title}</h1>
        <p className="mt-1 mb-0 text-sm leading-snug text-foreground/75">
          {copy.label.memberCount(memberCount)}
          {sentence ? <> · <span className="font-medium text-info-foreground">{sentence}</span></> : null}
          {goal ? <> · <span className="[overflow-wrap:anywhere]">{goal}</span></> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Under 1180 the member list is a drawer that already carries an edit
            control, so one button opens it; above, the column is always visible
            and the button jumps straight into editing. */}
        <Button variant="outline" className="min-[1180px]:hidden" onClick={onMembers}>
          {copy.action.members}
        </Button>
        <Button variant="outline" className="max-[1180px]:hidden" onClick={onManage}>
          {copy.action.manageMembers}
        </Button>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={next => { setMenuOpen(next); if (!next) setConfirming(false); }}
        >
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={copy.action.roomMenu}>
              <DotsThree size={22} weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          {/* The destructive step stays inside the menu rather than opening a
              dialog: it is a two-word confirmation, not a decision that deserves
              to take over the screen. */}
          <DropdownMenuContent align="end" className="w-56">
            {confirming ? (
              <div className="flex flex-col gap-2 p-2 text-[13px]">
                <p className="m-0 leading-snug text-foreground/75">{copy.say.clearConfirm}</p>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="xs" onClick={closeMenu}>{copy.action.cancel}</Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    className="px-2.5"
                    onClick={() => { closeMenu(); onReset(); }}
                  >
                    {copy.action.confirmClear}
                  </Button>
                </div>
              </div>
            ) : (
              <DropdownMenuItem
                disabled={disabled}
                onSelect={event => { event.preventDefault(); setConfirming(true); }}
              >
                {copy.action.clearChat}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
