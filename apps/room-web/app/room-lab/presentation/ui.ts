/** Shared Tailwind clusters. Type: 12 / 14 / 16 / 20. Space: 4 / 8 / 12 / 16. */

export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hydrangea';

export const sectionRow =
  'flex h-7 items-center justify-between text-xs text-muted';

export const textAction =
  `h-7 rounded-md bg-transparent px-1.5 text-xs text-ink hover:bg-garden hover:text-moss-deep disabled:opacity-50 ${focusRing}`;

export const quietButton =
  `inline-flex h-8 items-center rounded-lg border border-line bg-washi px-3 text-sm text-moss-deep hover:border-moss hover:bg-garden disabled:opacity-50 ${focusRing}`;
