# Room Studio design QA

## Target and evidence

- Source: `.tmp-bin/room-studio-qa/source.png` (the selected yellow studio mock).
- First implementation: `.tmp-bin/room-studio-qa/implementation-before.png`.
- Revised implementation: `.tmp-bin/room-studio-qa/implementation-after.png`.
- Both images: 1487 × 1058 pixels, matching a 1487 × 1058 CSS viewport at devicePixelRatio 1.
- State: one human message, four agent replies, Relay thinking; empty composer. The isolated local fixture renders the production `RoomWorkspace`, without modifying live room data.
- Compared both full images in the same visual input. Screenshot evidence is local-only and intentionally not committed.
- Use native CUA `getScreenshot()` for these captures. The alternate full-page screenshot API produced incorrectly scaled content; those captures were discarded from comparison.

## Findings — iteration 1

- [P2] Desktop typography and avatars are undersized. The reference uses roughly 20–22 px message text and larger illustrated portraits; the first implementation uses 17 px text and 54 px avatar boxes. Increase desktop text and portraits while preserving compact responsive breakpoints.
- [P2] Sidebar yellow is too muted, and the logo/crew are smaller than the selected design. Adjust the yellow token, sidebar track, logo placement and crew rhythm.
- [P2] Header actions and title are too small relative to the source. Increase desktop title and task button sizes; keep the secondary-task hierarchy.

## Intentional product constraints

- Actual runtime statuses replace the mock's unverified “online” labels.
- Empty or busy composers cannot send; disabled styling replaces the mock's always-active blue button.
- Message bodies remain safe plain text rather than fabricating bold emphasis in agent replies.
- The persistent local-memory caveat is retained. Task model PASS remains distinct from human approval.

## Implementation checklist

- [x] Correct desktop scale and palette.
- [x] Recapture at the source viewport and compare both full-resolution images in one visual input.
- [x] Check mobile layout, mentions, member dialog, Task mode and browser errors.

## Iteration 2: resolved findings

The revised view uses a 344 px sidebar, 40 px title, 20 px message text and 70 px
avatar boxes on desktop. The header baseline and message rhythm now follow the
selected mock; yellow `#ffe17a` replaces the muted first-pass color. The revised
capture resolves the three P2 findings from iteration 1. No actionable P0/P1/P2
visual mismatch remains.

### Required fidelity checks

| Surface | Evidence and result |
| --- | --- |
| Typography | Self-hosted Bricolage Grotesque 700 for agent labels; PingFang/Arial fallbacks for readable Chinese and body text. Full-resolution source and revised captures show comparable title/body hierarchy and line wrapping. |
| Spacing | Compare the header, first reply and bottom composer in both 1487 × 1058 captures. All five messages and the typing cue fit; the composer stays at the bottom. |
| Color | Bright yellow crew rail, warm paper conversation area, ink text, coral mentions and cobalt actions follow the selected palette. The empty composer intentionally has a gray disabled action. |
| Images | All six generated assets load. Portraits retain their aspect ratio and transparent edges; the black wordmark blends into yellow without a white rectangle. Standard controls use Phosphor icons. |
| Copy | App controls use the selected Chinese labels. Runtime evidence replaces speculative “online” text. The sample transcript matches the mock, except that safe plain text does not invent bold formatting. |

The logo/crew, author rows and composer were inspected at full resolution within
the combined comparison. Their text and edge detail are readable there; separate
cropped comparisons were not needed. The source's small arrow-shaped room-tab
edge and paper lighting are nonblocking P3 differences, not custom CSS artwork.

## Interaction evidence

- `.tmp-bin/room-studio-qa/mobile.png`: 390 × 844 CSS px, DPR 1. Document width is
  exactly 390 px. The send button remains inside the viewport; conversation
  scrolling does not move the composer out of reach.
- `.tmp-bin/room-studio-qa/mobile-crew.png`: all five members and reorder/remove
  controls fit in the dialog. Escape closes it and restores focus to its trigger.
- Real Remix `/room`: `@co` + Enter selects Codex without sending. Task mode shows
  the implementation/review roles, retains the draft and can return to chat.
- `.tmp-bin/room-studio-qa/live-room.png`: actual `@codex` smoke message and its
  “连接成功” reply at stream sequence 2. Details show Codex read through sequence 2;
  other agents remain unverified. This proves one provider round trip, not a
  fresh five-provider count-off or a completed live Task.
- Component tests cover IME/Enter, mention keyboard selection, nonempty crew and
  reorder payloads, HELD privacy, catch-up, reset confirmation, model-PASS copy,
  and draft preservation while polling. The stale-response test fails without
  its guard and passes with the guard.

## Browser and environment notes

The native browser initially saw stale Vite prebundle chunks; reload resolved
the invalid-hook failure. A later navigation exposed a separate host issue:
`codex-browser-sidebar-comments-root` adds a div directly under html, and Remix's
document hydration reports an unexpected div before recovering. That div does
not belong to the app. No application workaround or warning suppression was
added. Subsequent tested interactions succeeded, and the next reload/check
reported no new console errors. These observations do not establish that the
host-injection issue can never recur.

Production build and source checks are separate from this visual result. Local
captures and the isolated fixture remain ignored; package dry-run excludes them.
Human approval of the PR remains pending.

final result: passed
