import { Mention } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { RoomLabAgentId } from '../read-model';
import { MENTION_CHIPS, mentionChip } from './mention-chip';
import { MentionMenu, MENTION_LIST_ID, mentionOptionId, type MentionMenuHandle } from './MentionMenu';
import { buildMentionOptions, mentionCompletion, type MentionOption } from './mention-completion';

/** What the composer needs to know to wire aria state to the popup. */
export interface MentionBridge {
  /** Read at suggestion time, so changing the crew does not rebuild the editor. */
  activeAgentIds: () => readonly RoomLabAgentId[];
  onOpenChange: (open: boolean) => void;
  onActiveOptionChange: (id: string | undefined) => void;
}

/**
 * Where the popup goes. Above the caret by default, because the composer sits
 * at the bottom of the window; flipped below when the caret is too close to the
 * top for the list to fit.
 */
const GAP = 6;
function place(element: HTMLElement, rect: DOMRect | null) {
  if (!rect) return;
  const height = element.offsetHeight || 260;
  const above = rect.top - GAP - height;
  element.style.position = 'fixed';
  element.style.left = `${Math.max(GAP, Math.min(rect.left, window.innerWidth - element.offsetWidth - GAP))}px`;
  element.style.top = above >= GAP ? `${above}px` : `${rect.bottom + GAP}px`;
  element.style.zIndex = '40';
}

export function roomMentionSuggestion(bridge: MentionBridge): Omit<SuggestionOptions, 'editor'> {
  return {
    char: '@',
    items: ({ query }) =>
      mentionCompletion.filter(query.toLowerCase(), buildMentionOptions(bridge.activeAgentIds())),
    render: () => {
      let renderer: ReactRenderer<MentionMenuHandle, MentionMenuProps> | undefined;
      let container: HTMLDivElement | undefined;

      const mount = (props: SuggestionProps) => {
        container = document.createElement('div');
        document.body.appendChild(container);
        renderer = new ReactRenderer(MentionMenu, {
          editor: props.editor,
          props: {
            options: props.items,
            onSelect: (option: MentionOption) => props.command({ id: option.id, label: option.id }),
            onActiveChange: bridge.onActiveOptionChange,
          },
        });
        container.appendChild(renderer.element);
        place(container, props.clientRect?.() ?? null);
        bridge.onOpenChange(true);
      };

      const unmount = () => {
        renderer?.destroy();
        container?.remove();
        renderer = undefined;
        container = undefined;
        bridge.onOpenChange(false);
        bridge.onActiveOptionChange(undefined);
      };

      return {
        onStart: mount,
        onUpdate: props => {
          renderer?.updateProps({
            options: props.items,
            onSelect: (option: MentionOption) => props.command({ id: option.id, label: option.id }),
            onActiveChange: bridge.onActiveOptionChange,
          });
          if (container) place(container, props.clientRect?.() ?? null);
        },
        onKeyDown: props => {
          if (props.event.key === 'Escape') {
            unmount();
            return true;
          }
          return renderer?.ref?.onKeyDown(props.event) ?? false;
        },
        onExit: unmount,
      };
    },
  };
}

/**
 * The mention node. It serialises to `@id` in both directions that leave the
 * editor — `renderText` for plain text, `composer-doc`'s `docToText` for what is
 * actually sent — so a chip and the string the server parses are never allowed
 * to disagree.
 */
export function roomMention(bridge: MentionBridge) {
  return Mention.configure({
    HTMLAttributes: { 'data-mention': '' },
    renderText: ({ node }) => `@${node.attrs.id}`,
    renderHTML: ({ options, node }) => {
      const id = String(node.attrs.id ?? '');
      const chip = mentionChip(id) ?? MENTION_CHIPS.all;
      return [
        'span',
        { ...options.HTMLAttributes, class: chip.chipClass, 'data-id': id },
        ['span', { class: chip.dotClass, 'aria-hidden': 'true' }, chip.letters],
        chip.text,
      ];
    },
    suggestion: roomMentionSuggestion(bridge),
  });
}

// Local aliases: @tiptap/suggestion exports these only as part of its options type.
type SuggestionProps = Parameters<NonNullable<ReturnType<NonNullable<SuggestionOptions['render']>>['onStart']>>[0];
type MentionMenuProps = React.ComponentProps<typeof MentionMenu>;

export { MENTION_LIST_ID, mentionOptionId };
