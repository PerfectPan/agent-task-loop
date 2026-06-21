import { describe, expect, it } from 'vitest';
import { extractClaudeStructured, stripCodeFences } from '../../src/services/structured-ai-service';

describe('extractClaudeStructured', () => {
  it('pulls structured_output and the session id from a stream-json transcript', () => {
    const out = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }),
      JSON.stringify({ type: 'result', structured_output: { message: 'hi' } }),
    ].join('\n');
    const r = extractClaudeStructured<{ message: string }>(out);
    expect(r.data.message).toBe('hi');
    expect(r.sessionId).toBe('s1');
  });

  it('throws the model error text on an is_error result', () => {
    const out = JSON.stringify({ type: 'result', is_error: true, result: 'boom' });
    expect(() => extractClaudeStructured(out)).toThrow('boom');
  });

  it('throws when no structured output is present', () => {
    const out = JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' });
    expect(() => extractClaudeStructured(out)).toThrow(/Failed to parse/);
  });
});

describe('stripCodeFences', () => {
  it('removes a wrapping ```json fence', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves unfenced text untouched (trimmed)', () => {
    expect(stripCodeFences('  hello  ')).toBe('hello');
  });
});
