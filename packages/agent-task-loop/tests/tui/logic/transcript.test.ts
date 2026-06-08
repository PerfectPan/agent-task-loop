import { describe, expect, it } from 'vitest';
import { parseTranscript, parseTranscriptLine } from '../../../src/tui/logic/transcript';

describe('parseTranscriptLine (codex rollout)', () => {
  it('keeps agent and user messages', () => {
    expect(parseTranscriptLine('{"type":"event_msg","payload":{"type":"agent_message","message":"hi there"}}')).toBe(
      'assistant: hi there',
    );
    expect(parseTranscriptLine('{"payload":{"type":"user_message","message":"do x"}}')).toBe('user: do x');
  });

  it('flattens a message with role + content parts', () => {
    const line =
      '{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}';
    expect(parseTranscriptLine(line)).toBe('user: hello');
  });

  it('summarizes tool calls and drops noise', () => {
    expect(parseTranscriptLine('{"payload":{"type":"function_call","name":"shell"}}')).toBe('⚙ shell');
    expect(parseTranscriptLine('{"payload":{"type":"token_count"}}')).toBeNull();
    expect(parseTranscriptLine('{"payload":{"type":"function_call_output"}}')).toBeNull();
    expect(parseTranscriptLine('{"type":"session_meta","payload":{"type":"session_meta"}}')).toBeNull();
  });
});

describe('parseTranscriptLine (claude session)', () => {
  it('extracts role + text from message.content', () => {
    const line =
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"done"},{"type":"tool_use","name":"Edit"}]}}';
    expect(parseTranscriptLine(line)).toBe('assistant: done ⚙ Edit');
  });

  it('handles a plain string content', () => {
    expect(parseTranscriptLine('{"message":{"role":"user","content":"hey"}}')).toBe('user: hey');
  });
});

describe('parseTranscriptLine edge cases', () => {
  it('returns null for invalid JSON or empty content', () => {
    expect(parseTranscriptLine('not json')).toBeNull();
    expect(parseTranscriptLine('{"payload":{"type":"agent_message","message":"   "}}')).toBeNull();
  });
});

describe('parseTranscript', () => {
  it('keeps the last N readable lines and skips blanks/noise', () => {
    const content = [
      '{"payload":{"type":"session_meta"}}',
      '{"payload":{"type":"user_message","message":"a"}}',
      '',
      '{"payload":{"type":"token_count"}}',
      '{"payload":{"type":"agent_message","message":"b"}}',
      '{"payload":{"type":"agent_message","message":"c"}}',
    ].join('\n');
    expect(parseTranscript(content, 2)).toEqual(['assistant: b', 'assistant: c']);
    expect(parseTranscript(content, 0)).toEqual([]);
    expect(parseTranscript(undefined, 10)).toEqual([]);
  });
});
