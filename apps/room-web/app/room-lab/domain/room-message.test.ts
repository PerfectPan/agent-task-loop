import { describe, expect, it } from 'vitest';
import { parseRoomMessage } from './room-message';
import { TEST_AGENT_IDS } from '../presentation/testing/test-agents';

const ACTIVE = TEST_AGENT_IDS;

describe('parseRoomMessage', () => {
  it('extracts and de-duplicates known agent mentions without rewriting the body', () => {
    const body = '@codex 请先写提纲，@relay 再润色；@codex 最后收口。';

    expect(parseRoomMessage(body, ACTIVE)).toEqual({
      body,
      addressedTo: ['codex', 'relay'],
      unknownMentions: [],
      inactiveMentions: [],
    });
  });

  it('expands @all in composition order', () => {
    expect(parseRoomMessage('@all 开始讨论', ACTIVE)).toMatchObject({
      addressedTo: ['relay', 'claude', 'codex', 'opencode', 'dsh'],
      unknownMentions: [],
      inactiveMentions: [],
    });
  });

  it('reports unknown explicit mentions but ignores embedded at-sign text', () => {
    expect(parseRoomMessage('邮件 a@codex.dev 和 @nobody 都不是 Room 地址', ACTIVE)).toEqual({
      body: '邮件 a@codex.dev 和 @nobody 都不是 Room 地址',
      addressedTo: [],
      unknownMentions: ['nobody'],
      inactiveMentions: [],
    });
  });

  it('expands @all in composition order and reports known inactive mentions', () => {
    expect(parseRoomMessage('@all 开始，@claude 稍后加入', ['dsh', 'codex'], ACTIVE)).toEqual({
      body: '@all 开始，@claude 稍后加入',
      addressedTo: ['dsh', 'codex'],
      unknownMentions: [],
      inactiveMentions: ['claude'],
    });
  });

  it('calls a mention outside the registry unknown, however well formed it is', () => {
    expect(parseRoomMessage('@gemini 来看看', ACTIVE, ACTIVE)).toMatchObject({
      addressedTo: [],
      unknownMentions: ['gemini'],
      inactiveMentions: [],
    });
    // The same word is an address once it is a row the room seats.
    expect(parseRoomMessage('@gemini 来看看', ['gemini'], [...ACTIVE, 'gemini'])).toMatchObject({
      addressedTo: ['gemini'],
      unknownMentions: [],
    });
  });

  it('reads an id with digits, which the id grammar allows', () => {
    expect(parseRoomMessage('@gpt5 先说', ['gpt5'])).toMatchObject({
      addressedTo: ['gpt5'],
      unknownMentions: [],
    });
  });
});
