/**
 * What is left of the room's shared Tailwind clusters once the shadcn
 * components carry the controls. Buttons, fields, badges and menus come from
 * `~/components/ui/*`; only this one pure-typography cluster is shared here.
 *
 * Type: 12 / 13 / 14 / 16 / 24, nothing in between; 18 is allowed once, for the
 * empty-state title. Space: 4 / 8 / 12 / 14 / 22 / 28.
 * Radius: `rounded-sm` is 4px — controls, pills, fields; `rounded-md` is 6px —
 * rows and menu items; `rounded-lg` is 8px — the composer card, the menus, the
 * drawer, the count-off block. All three derive from shadcn's `--radius`.
 * Surfaces: `background` is the sheet, `sidebar` the two margins beside it,
 * `card` / `popover` anything lifted off the page. The margins are told from
 * the sheet by a hairline (`sidebar-border`), not by a field of colour.
 */

/** Section label in the rail and the context column. Quiet, never uppercase. */
export const sectionLabel = 'm-0 text-xs font-medium text-muted-foreground';
