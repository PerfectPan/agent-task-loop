import { describe, expect, it } from 'vitest';
import { parseRoomMessage } from './room-message';

describe('parseRoomMessage', () => {
  it('extracts and de-duplicates known agent mentions without rewriting the body', () => {
    const body = '@codex 请先写提纲，@claude-relay 再润色；@codex 最后收口。';

    expect(parseRoomMessage(body)).toEqual({
      body,
      addressedTo: ['codex', 'claude-relay'],
      unknownMentions: [],
    });
  });

  it('expands @all in roster order', () => {
    expect(parseRoomMessage('@all 开始讨论')).toMatchObject({
      addressedTo: ['claude-relay', 'claude', 'codex', 'opencode', 'dsh'],
      unknownMentions: [],
    });
  });

  it('reports unknown explicit mentions but ignores embedded at-sign text', () => {
    expect(parseRoomMessage('邮件 a@codex.dev 和 @nobody 都不是 Room 地址')).toEqual({
      body: '邮件 a@codex.dev 和 @nobody 都不是 Room 地址',
      addressedTo: [],
      unknownMentions: ['nobody'],
    });
  });
});
