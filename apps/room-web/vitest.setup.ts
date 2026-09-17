/**
 * Browser APIs jsdom does not implement, which the shadcn/Radix components and
 * the theme switch rely on. These are environment shims, not test doubles for
 * anything this project owns: each one returns what a real browser would return
 * for the default case the tests exercise (a light system theme, a viewport
 * wide enough to keep the members column docked).
 */
if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  }

  if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  // Radix's menus capture the pointer and scroll the active item into view.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }

  // ProseMirror measures the caret to place the selection and the suggestion
  // popup. jsdom has no layout, so every rect is zero; the popup's position is
  // not what any of these tests are about.
  const zeroRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
    toJSON: () => ({}),
  }) as DOMRect;
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({
      length: 0, item: () => null, [Symbol.iterator]: function* () {},
    }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = zeroRect;
  }
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
  }
  if (!document.createRange) {
    document.createRange = () => new Range();
  }
}
