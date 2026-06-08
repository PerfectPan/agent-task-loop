import { describe, expect, it } from 'vitest';

import { PREVIEW_MODES } from '../../../src/tui/types';
import {
  PANE_ORDER,
  nextPane,
  prevPane,
  nextPreviewMode,
} from '../../../src/tui/logic/pane';

describe('PANE_ORDER', () => {
  it('is list -> detail -> preview', () => {
    expect(PANE_ORDER).toEqual(['list', 'detail', 'preview']);
  });
});

describe('nextPane', () => {
  it('cycles list -> detail -> preview -> list when preview is open', () => {
    expect(nextPane('list', true)).toBe('detail');
    expect(nextPane('detail', true)).toBe('preview');
    expect(nextPane('preview', true)).toBe('list');
  });

  it('skips preview when preview is closed (list <-> detail)', () => {
    expect(nextPane('list', false)).toBe('detail');
    expect(nextPane('detail', false)).toBe('list');
  });
});

describe('prevPane', () => {
  it('cycles in reverse when preview is open', () => {
    expect(prevPane('list', true)).toBe('preview');
    expect(prevPane('preview', true)).toBe('detail');
    expect(prevPane('detail', true)).toBe('list');
  });

  it('skips preview when preview is closed', () => {
    expect(prevPane('list', false)).toBe('detail');
    expect(prevPane('detail', false)).toBe('list');
  });
});

describe('preview mode cycling', () => {
  it('cycles forward through output/history/logs', () => {
    expect(PREVIEW_MODES).toEqual(['output', 'history', 'logs']);
    expect(nextPreviewMode('output')).toBe('history');
    expect(nextPreviewMode('history')).toBe('logs');
    expect(nextPreviewMode('logs')).toBe('output');
  });
});
