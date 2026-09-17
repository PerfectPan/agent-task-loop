import { describe, expect, it } from 'vitest';
import { docToText, textToDoc, type MentionId } from './composer-doc';
import { parseRoomMessage } from '../domain/room-message';

const ACTIVE: MentionId[] = ['all', 'claude-relay', 'claude', 'codex', 'opencode', 'dsh'];
const roundTrip = (value: string) => docToText(textToDoc(value, ACTIVE));

describe('composer document', () => {
  it('serialises a mention node back to the text the server parses', () => {
    const doc = textToDoc('@codex 先别写代码', ACTIVE);
    const paragraph = doc.content?.[0];
    expect(paragraph?.content?.[0]).toEqual({ type: 'mention', attrs: { id: 'codex', label: 'codex' } });
    expect(paragraph?.content?.[1]).toEqual({ type: 'text', text: ' 先别写代码' });
    expect(docToText(doc)).toBe('@codex 先别写代码');
  });

  it('round-trips every shape the composer can produce', () => {
    for (const value of [
      '@codex 先别写代码',
      '@all 都看一下',
      '先说结论 @claude-relay 再展开',
      '两位都来：@codex 和 @claude',
      '没有提及的一句话',
      '行一\n行二',
      '行一\n\n行三',
      '@dsh',
    ]) {
      expect(roundTrip(value)).toBe(value);
    }
  });

  it('agrees with parseRoomMessage about who was addressed', () => {
    const value = '@codex 和 @claude 看一下，@nobody 不算';
    const chips = (textToDoc(value, ACTIVE).content?.[0]?.content ?? [])
      .filter(node => node.type === 'mention')
      .map(node => node.attrs?.id);
    expect(chips).toEqual(['codex', 'claude']);
    expect(parseRoomMessage(value).addressedTo.sort()).toEqual(['claude', 'codex']);
  });

  it('leaves an unknown handle as plain text so it cannot look addressable', () => {
    const doc = textToDoc('@nobody 在吗', ACTIVE);
    expect(doc.content?.[0]?.content).toEqual([{ type: 'text', text: '@nobody 在吗' }]);
    expect(docToText(doc)).toBe('@nobody 在吗');
  });

  it('leaves a member who is not in this room as plain text', () => {
    const doc = textToDoc('@dsh 看看', ['all', 'codex']);
    expect(doc.content?.[0]?.content).toEqual([{ type: 'text', text: '@dsh 看看' }]);
  });

  it('keeps @all as a mention', () => {
    const doc = textToDoc('@all 报个数', ACTIVE);
    expect(doc.content?.[0]?.content?.[0]).toEqual({ type: 'mention', attrs: { id: 'all', label: 'all' } });
  });

  it('turns newlines into paragraphs and back', () => {
    const doc = textToDoc('第一段\n第二段', ACTIVE);
    expect(doc.content).toHaveLength(2);
    expect(docToText(doc)).toBe('第一段\n第二段');
  });

  it('reads a hard break as a newline', () => {
    expect(docToText({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: '上' },
          { type: 'hardBreak' },
          { type: 'text', text: '下' },
        ],
      }],
    })).toBe('上\n下');
  });

  it('reads an empty document, and a document holding only an empty paragraph, as empty', () => {
    expect(docToText({ type: 'doc', content: [] })).toBe('');
    expect(docToText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
    expect(docToText(undefined)).toBe('');
    // What the editor holds after one Enter on an empty line: still nothing to send.
    expect(docToText({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph' }] })).toBe('');
  });

  it('trims the edges so leading blank lines do not make a message look non-empty', () => {
    expect(docToText(textToDoc('\n  \n说点什么', ACTIVE))).toBe('说点什么');
  });
});
