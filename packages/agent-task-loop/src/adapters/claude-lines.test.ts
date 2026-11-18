import { describe, expect, it } from 'vite-plus/test';
import { claudeResultEvents } from './claude-lines';

describe('claudeResultEvents', () => {
  it('keeps only the object lines, last first', () => {
    const output = [
      '{"type":"system","subtype":"init"}',
      'null',
      'progress text',
      '7',
      '{"type":"result","subtype":"success","result":"done"}',
    ].join('\n');

    expect(claudeResultEvents(output)).toEqual([
      { type: 'result', subtype: 'success', result: 'done' },
      { type: 'system', subtype: 'init' },
    ]);
  });
});
