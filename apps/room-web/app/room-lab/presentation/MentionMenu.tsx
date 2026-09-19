import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { MentionOption } from './mention-completion';
import { AgentMark } from './AgentMark';

export const MENTION_LIST_ID = 'room-mention-options';
export const mentionOptionId = (id: string) => `room-mention-${id}`;

/** What the suggestion renderer hands back to the editor for each key. */
export interface MentionMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
  activeId: () => string | undefined;
}

export interface MentionMenuProps {
  options: MentionOption[];
  onSelect: (option: MentionOption) => void;
  /** Reported upward so the editor can point aria-activedescendant at it. */
  onActiveChange?: (id: string | undefined) => void;
}

/**
 * The mention list. It keeps the listbox semantics the composer has always had
 * — `role="listbox"`, one `role="option"` per member, `aria-selected` on the
 * active one — but the arrow keys now arrive from the editor through the
 * imperative handle rather than from a textarea's own key handler, because with
 * Tiptap the caret lives inside ProseMirror and the list never takes focus.
 */
export const MentionMenu = forwardRef<MentionMenuHandle, MentionMenuProps>(
  function MentionMenu({ options, onSelect, onActiveChange }, ref) {
    const [activeIndex, setActiveIndex] = useState(0);

    // A narrowing query can strand the cursor past the end of the list.
    useEffect(() => { setActiveIndex(0); }, [options]);
    useEffect(() => { onActiveChange?.(options[activeIndex]?.id); }, [options, activeIndex, onActiveChange]);

    useImperativeHandle(ref, () => ({
      activeId: () => options[activeIndex]?.id,
      onKeyDown: event => {
        // Never act on a key that is still part of an IME composition: the
        // Enter that confirms 中文 candidates must not pick a member.
        if (event.isComposing || event.keyCode === 229) return false;
        if (options.length === 0) return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          setActiveIndex(index => (index + direction + options.length) % options.length);
          return true;
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
          const option = options[activeIndex] ?? options[0];
          if (option) onSelect(option);
          return true;
        }
        return false;
      },
    }), [options, activeIndex, onSelect]);

    return (
      <div
        id={MENTION_LIST_ID}
        className="max-h-[min(260px,40dvh)] w-[min(340px,100%)] overflow-y-auto rounded-lg border border-input bg-popover p-1 shadow-card"
        role="listbox"
        aria-label="选择要提及的成员"
      >
        {options.length === 0 ? (
          <p className="m-0 p-2 text-[13px] text-muted-foreground">没有匹配的成员</p>
        ) : options.map((option, index) => {
          const active = index === activeIndex;
          const agentId = option.id === 'all' ? undefined : option.id;
          return (
            <button
              key={option.id}
              id={mentionOptionId(option.id)}
              type="button"
              role="option"
              aria-selected={active}
              className={`grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${active ? 'bg-accent text-accent-foreground' : ''}`}
              // Taking focus would collapse the editor's selection and close the
              // suggestion before the click lands.
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(option)}
            >
              {agentId
                ? <AgentMark agentId={agentId} color={option.color} size={22} />
                : (
                  <span
                    aria-hidden="true"
                    className="grid size-[22px] place-items-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground"
                  >
                    @
                  </span>
                )}
              <span className="min-w-0 truncate">
                {option.id}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {option.id === 'all' ? '所有在场成员' : option.description}
                </span>
              </span>
              {active && (
                <kbd
                  aria-hidden="true"
                  className="rounded-sm border border-input px-1.5 font-mono text-[11px] leading-[18px] text-muted-foreground"
                >
                  ↵
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    );
  },
);
