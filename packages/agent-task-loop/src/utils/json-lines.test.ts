import { describe, expect, it } from 'vite-plus/test';
import { jsonLinesLastFirst } from './json-lines';

describe('jsonLinesLastFirst', () => {
  it('returns the JSON lines last first and skips blank and non-JSON lines', () => {
    const output = ['{"a":1}', '', 'not json', '  [2]  ', 'null', '{"b":'].join('\n');

    expect(jsonLinesLastFirst(output)).toEqual([null, [2], { a: 1 }]);
  });
});
