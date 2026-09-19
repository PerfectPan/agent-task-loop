import type { JSONContent } from '@tiptap/core';
import { ROOM_MENTION_SOURCE } from '../domain/room-message';
import type { RoomLabAgentId } from '../read-model';

/**
 * The composer edits a document; the room stores a string. These two pure
 * functions are the whole bridge, and they are the only place that knows a
 * mention chip and the text `@codex` are the same fact.
 *
 * Round-tripping matters because the two directions are used at different
 * moments: every keystroke serialises the document so `RoomLab` keeps holding a
 * plain string, and a failed send hands that string back for the editor to
 * rebuild. A mention that survives one direction but not the other would turn a
 * chip into loose text (or the reverse) the first time a send fails.
 */

export const MENTION_NODE = 'mention';

/** Ids a rebuild is allowed to turn back into chips: the room's own plus `all`. */
export type MentionId = RoomLabAgentId | 'all';

/**
 * Document → string. Paragraphs join with a newline, a hard break is a newline,
 * a mention is `@id`. The result is trimmed at both ends, so a trailing empty
 * paragraph (which is what an editor holds after you press Enter once) does not
 * make an otherwise blank message look non-empty.
 */
export function docToText(doc: JSONContent | null | undefined): string {
  if (!doc?.content) return '';
  return doc.content.map(blockToText).join('\n').trim();
}

function blockToText(block: JSONContent): string {
  if (!block.content) return '';
  return block.content.map(inlineToText).join('');
}

function inlineToText(node: JSONContent): string {
  if (node.type === MENTION_NODE) {
    const id = node.attrs?.id;
    return typeof id === 'string' ? `@${id}` : '';
  }
  if (node.type === 'hardBreak') return '\n';
  return node.text ?? '';
}

/**
 * String → document. Splits on newlines into paragraphs, then cuts each line on
 * the room's own mention grammar. Only ids the room actually knows become
 * chips: `@nobody` is not a mention to the server, so it must not look like one
 * here either.
 */
export function textToDoc(value: string, mentionable: readonly MentionId[]): JSONContent {
  const allowed = new Set<string>(mentionable);
  const lines = value.split('\n');
  return {
    type: 'doc',
    content: lines.map(line => ({
      type: 'paragraph',
      ...(line.length > 0 ? { content: lineToInline(line, allowed) } : {}),
    })),
  };
}

function lineToInline(line: string, allowed: Set<string>): JSONContent[] {
  const pattern = new RegExp(ROOM_MENTION_SOURCE, 'gi');
  const nodes: JSONContent[] = [];
  let cursor = 0;
  const push = (text: string) => { if (text) nodes.push({ type: 'text', text }); };

  for (const match of line.matchAll(pattern)) {
    const id = match[1]?.toLowerCase();
    if (!id || !allowed.has(id)) continue;
    push(line.slice(cursor, match.index));
    nodes.push({ type: MENTION_NODE, attrs: { id, label: id } });
    cursor = (match.index ?? 0) + match[0].length;
  }
  push(line.slice(cursor));
  return nodes;
}
