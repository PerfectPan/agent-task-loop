import { PREVIEW_MODES, type Pane, type PreviewMode } from '../types';

/** Focus order of the dashboard panes, left to right. */
export const PANE_ORDER: readonly Pane[] = ['list', 'detail', 'preview'];

/**
 * The panes available for focus given whether the preview pane is open.
 * When closed, 'preview' is dropped so focus cycles list <-> detail only.
 */
function focusablePanes(previewOpen: boolean): readonly Pane[] {
  return previewOpen ? PANE_ORDER : PANE_ORDER.filter((p) => p !== 'preview');
}

/** Generic forward cycle over a non-empty list; wraps and tolerates an absent `current`. */
function cycle<T>(items: readonly T[], current: T, step: 1 | -1): T {
  const index = items.indexOf(current);
  const base = index === -1 ? 0 : index;
  const next = (base + step + items.length) % items.length;
  return items[next]!;
}

/**
 * Advance focus to the next pane, skipping 'preview' when it is closed.
 * @param current The currently focused pane.
 * @param previewOpen Whether the preview pane is open and focusable.
 */
export function nextPane(current: Pane, previewOpen: boolean): Pane {
  return cycle(focusablePanes(previewOpen), current, 1);
}

/**
 * Move focus to the previous pane, skipping 'preview' when it is closed.
 * @param current The currently focused pane.
 * @param previewOpen Whether the preview pane is open and focusable.
 */
export function prevPane(current: Pane, previewOpen: boolean): Pane {
  return cycle(focusablePanes(previewOpen), current, -1);
}

/** Advance the preview pane to its next mode (output -> history -> logs -> output). */
export function nextPreviewMode(current: PreviewMode): PreviewMode {
  return cycle(PREVIEW_MODES, current, 1);
}

/** Move the preview pane to its previous mode (output -> logs -> history -> output). */
export function prevPreviewMode(current: PreviewMode): PreviewMode {
  return cycle(PREVIEW_MODES, current, -1);
}
