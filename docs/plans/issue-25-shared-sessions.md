# Implementation Plan — Session Browser TUI (#25) + CLI Output Redesign (#23)

> **TL;DR** — Issue #25 asks for an *interactive* TUI to browse, inspect-trace, and resume coding-agent sessions across Codex / Claude Code / OpenCode, usable both standalone (`agent-finder-cli`) and task-linked (`agent-task-loop`). We build a small **internal** session-discovery + transcript core (lifted *and rewritten* from `agent-task-loop`, **not** verbatim) and an Ink browsing TUI on top of it; the non-interactive `sessions list/inspect --json` is a thin scripting affordance, not the headline. Two of three tools (Codex, Claude) are JSONL/UUID on disk and well-understood; **OpenCode stores sessions in a SQLite `opencode.db` with `ses_…` ids — not JSONL/UUID** — so it needs a separate provider behind a research spike and is explicitly a stretch goal, not a v1 guarantee. We ship the genuinely-ready #23 presentation redesign first (it's the one phase grounded today), keep everything internal-bundled (no new published npm packages), and inject resume binaries from the CLI layer instead of pulling MoonBit into the core. Packages are bundled, not published; resume is print-a-command in v1 and realistically covers 2 of 3 tools.

## Phase checklist

- [ ] **P0** — Re-derive the real #31 disposition from its actual diff; transcribe verified salvage notes into #25.
- [ ] **P1** — `cli-presentation` (internal) + migrate `scan` / `provider` / `doctor` output (#23). *Ready today; ships alone.*
- [ ] **P2a** — Session model + transcript parser **rewrite** (`TranscriptEntry` + `toLines()` shim) with fake-root unit tests.
- [ ] **P2b** — Generalize the bounded fs-index from `id→path` to `id→Session` (Codex + Claude only).
- [ ] **P2c** — `SessionRegistry` + Codex/Claude providers; injectable roots.
- [ ] **P3** — `agent-task-loop` TUI composes the core via `toLines()`; no #42 regression.
- [ ] **P4** — Interactive **browsing TUI** in `agent-finder-cli` (the #25 headline) + thin `sessions list/inspect --json`.
- [ ] **P5** — Resume-as-command (print only), `resumable` capability surfaced; Codex + Claude verified, OpenCode best-effort.
- [ ] **SPIKE-OC** *(parallel, gates any OpenCode support)* — SQLite `opencode.db` reader spike: schema, id↔transcript join, resume CLI.
- [ ] **P6** *(later)* — Higher-fidelity trace view (`tool_result`, code blocks), in-TUI scroll search, `--exec` resume, OpenCode provider if SPIKE-OC succeeds.

---

## 1. Goal & Scope

**One internal core, two frontends, one presentation layer.** Build a tool-agnostic session-discovery + transcript layer consumed by **both** `agent-finder-cli` (standalone, cross-tool browser) and `agent-task-loop` (task-linked TUI), plus a shared presentation layer so the redesigned CLI output (#23) and the TUI render from the same view-models.

### What #25 actually asks for (re-read, not paraphrased)

The issue title is *"Introduce a TUI for browsing and resuming coding agent sessions."* The body wants: list across agents, **view details and traces**, resume when supported, filter by agent/project/task/status, and future `agent-task-loop` integration. It does **not** mandate a specific interaction model — *"could use a Vim-like interaction model or another terminal-native layout, depending on what best fits the UX."*

> **Scope correction (accepting the critique, with a bounded push-back).** The draft inverted the ask by shipping a non-interactive `list/inspect` as v1 and deferring the actual TUI to "later." That's wrong — the headline deliverable (P4) is now an **interactive Ink browsing TUI** (list pane + trace preview + keyboard nav + resume affordance). **Push-back:** the critique implies the non-interactive command is the wrong itch entirely; it isn't — #25 lists "listing sessions across supported agents" first and explicitly calls for **standalone + scriptable** dual usage, so we keep a thin `sessions list/inspect --json` as a scripting/CI affordance riding the *same* core. It is a byproduct, not the product. We are **not** building a full Vim-modal viewport in v1 (no real scrollable viewport, no in-trace search — those are P6); v1 is a navigable two-pane browser with preview-grade traces. This is "another terminal-native layout" and satisfies the headline.

### In scope (v1)
- Internal package `@rivus/agent-sessions` (TS, **bundled into consumers, not published**): generic `Session` model, per-tool `SessionProvider`s, JSONL transcript parsing, bounded on-disk indexer. **Codex + Claude** are first-class; **OpenCode is gated behind SPIKE-OC** (see §6).
- Internal package `@rivus/cli-presentation` (**bundled, not published**): `ColumnSchema`-driven table renderer, status theming, key-value + summary blocks, TTY/`NO_COLOR` gating, framework-agnostic view-model helpers reused by the Ink TUI. Existing `scan`/`provider`/`doctor` output migrated onto it (#23).
- `agent-finder-cli`: interactive `sessions` TUI (browse + preview trace + resume command) and a thin non-interactive `sessions list`/`sessions inspect <id>` with `--json`/filters for scripting.
- `agent-task-loop` TUI: refactor its `SessionProvider` to **compose over** the new core; task→session linkage stays in `agent-task-loop`; no behavior regression vs the #42 dashboard.

### Out of scope (v1) — explicitly deferred
- **Executing** resume (spawning the agent / pty handoff). v1 prints a copyable command only.
- Full transcript fidelity (`tool_result` bodies, diffs, syntax-highlighted code blocks, token usage). Preview-grade only.
- Real scrollable viewport + in-trace search/filter in the TUI (current `marginTop` approach stays).
- **Guaranteed OpenCode support** — it requires a SQLite reader on a different code path (SPIKE-OC). If the spike doesn't land, v1 ships Codex + Claude and labels OpenCode "not yet supported."
- Moving discovery into the MoonBit core. The session layer is TS-only; MoonBit `@rivus/agent-finder-core` keeps owning *provider* discovery. **The core does NOT read MoonBit** (see §5 — resume binaries are injected from the CLI layer).
- Publishing new npm packages. Both new packages are internal and bundled.

---

## 2. Shared Abstraction — `@rivus/agent-sessions` (internal)

New **internal** workspace package at `packages/agent-sessions`, `private: true`, no `publishConfig`, **bundled into `agent-finder-cli`'s rslib dist** (and consumed as `workspace:*` by `agent-task-loop`). pnpm + rslib + vitest, mirroring the existing package shape. Zero dependency on `TaskRecord`, citty, Ink, or MoonBit.

> **Publishing correction (accepting the critique).** The draft proposed publishing both new packages with the "generic capability" framing as justification. That's marketing, not a requirement — the only external consumer is the already-published `agent-finder-cli`, and the only internal consumer is `agent-task-loop`. Bundling via rslib avoids two extra changesets, two publish surfaces, semver coupling, and `private:false`/`publishConfig` churn for zero lost capability. **Default to internal; extract + publish only if a real third consumer appears.**

### Core data model
```ts
export type AgentKind = 'codex' | 'claude' | 'opencode' | 'unknown';

export interface Session {
  id: string;                 // UUID (codex/claude) or native id (opencode 'ses_…')
  agent: AgentKind;           // inferred from SOURCE ROOT (see attribution caveat below)
  title?: string;             // first user message / metadata title / basename
  cwd?: string;               // project/workspace path if recoverable
  path?: string;              // transcript path (filesystem tools); undefined for db-backed tools
  createdAt?: string;         // ISO; from metadata if present
  updatedAt: string;          // ISO; metadata else file mtime (always present)
  messageCount?: number;      // cheap count when affordable
  resumable: boolean;         // does this agent support resume? (capability flag, §5)
}

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'reasoning' | 'tool';
  text: string;               // collapsed preview text (v1 fidelity)
  toolName?: string;
  timestamp?: string;
}

export interface SessionProvider {
  readonly agent: AgentKind;
  roots(): string[];                                              // owned roots (default + injected)
  list(opts?: ListOptions): Promise<Session[]>;                   // enumerate w/ metadata (NEW for #25)
  getTranscript(id: string, maxLines?: number): Promise<TranscriptEntry[]>; // never throws → [] on miss
  resumeCommand(id: string): Promise<string | null>;             // null if unsupported (§5)
}
```

Note `path` is now **optional** — the OpenCode (SQLite) provider has no per-session file, so a file-centric `path: string` was a wrong assumption baked in by the draft.

### What to lift / generalize — corrected effort

> **"Verbatim move" correction (accepting the critique).** The draft claimed `transcript.ts` is "already fully generic / handles all three tools" and can be moved verbatim while also changing its output type from `string[]` to `TranscriptEntry[]`. Both halves are false and mutually exclusive. Verified in `packages/agent-task-loop/src/tui/logic/transcript.ts`: the parser emits lossy `role: text` **strings**, collapses `tool_use` to `⚙ name`, and **drops** `tool_result` bodies and timestamps. Emitting structured `TranscriptEntry{role,text,toolName,timestamp}` is a **parser rewrite plus a `toLines()` adapter**, not a lift. And it does **not** handle OpenCode at all (no JSONL there). P2a is sized accordingly.

- **Parser → rewrite (P2a).** Rewrite `parseTranscriptLine`/`parseTranscript` to return `TranscriptEntry[]`, preserving its existing tolerance for the Codex `{payload}` and Claude `{message}` envelopes (returns `null`/skips on garbage). Capture `toolName` and `timestamp` that the current parser discards. Ship a `toLines(entries): string[]` shim that reconstructs the **exact** legacy `role: text` / `⚙ name` strings so `agent-task-loop`'s string-based renderer stays byte-identical during migration (locked by a golden-output test against current `transcript.test.ts` fixtures).
- **`session-tail.ts` (`tailLines`) → move verbatim (P2a).** Genuinely generic; no shape change.
- **`heartbeat.ts` → move `heartbeatFreshness` + `heartbeatColor` (P2a).** Generic age/freshness classification. Leave `runnerLabel` (task-runner-specific) in `agent-task-loop`.
- **fs-index → generalize, scoped to Codex + Claude (P2b).** Extract the bounded walk (`SCAN_BUDGET=50_000`, `MAX_DEPTH=6`, `UUID_RE`, injectable `readFile`/`readdir`, verified at `fs-session-provider.ts:13-16`) into `internal/fs-index.ts`. Generalize `id→path` to `id→Session` by (a) attributing `agent` from the matched root, (b) capturing mtime as `updatedAt`, (c) optionally sniffing the first user line for `title`. **This index is UUID + `.jsonl` specific and applies only to Codex/Claude — it structurally cannot index OpenCode** (see §6).
- **Keep in `agent-task-loop`** (task-coupled): `session-history-parse.ts`, `status.ts` (Chinese task statuses), `buildPreviewFromTask`, `TaskRecord`, the `SessionPreview` shape and its hooks.

### Providers
- `CodexProvider` — root `~/.codex/sessions`, UUID-in-filename `.jsonl`, `resumable: true` (command verified in P5). Filesystem path.
- `ClaudeProvider` — root `~/.claude/projects`, UUID file naming `.jsonl`, `resumable: true` (verified in P5). Filesystem path.
- `OpenCodeProvider` — **gated behind SPIKE-OC.** SQLite reader over `~/.local/share/opencode/opencode.db` (`session` / `message` / `part` tables; ids `ses_…`). Separate code path, **not** the fs-index. Ships in P6 only if the spike succeeds; otherwise `agent` enumeration returns nothing for opencode and the UI says "not yet supported."
- `SessionRegistry` aggregates providers, merges/dedups, exposes `list()/getTranscript()/resumeCommand()` across all. Roots are injectable (tests + non-default installs).

> **Agent-attribution correction (partial accept).** The draft sold "attribute from source root" as a clean *fix* over #31's metadata trust. It is **more reliable** for the three known default roots, but the critique is right that it's oversold: Codex and Claude both key on a UUID in the **same** dedup map (first-wins, verified in `fs-session-provider.ts`), so a cross-root UUID collision or an overlapping custom `--root` can silently mislabel. We keep root-attribution (it's correct for default installs) but (a) **namespace the index by `agent` so the same UUID under two roots produces two `Session`s, not one shadowed entry**, and (b) document that custom `--root` dirs fall back to `unknown`. No claim that it's collision-proof.

---

## 3. Consumption — One Core, Two Frontends

### agent-finder-cli (standalone) — interactive TUI is the headline
- **`sessions` (interactive, default) — the #25 deliverable.** Ink TUI: a list pane (sessions newest-first, agent badge, title/cwd, relative age) + a trace preview pane (`getTranscript`), keyboard navigation (up/down to move, enter to preview, `r` to copy/print the resume command, `/` reserved for P6 search). Renders from the shared view-models in §4 (status theme, column schema, truncation) so list rows match the non-interactive table.
- **`sessions list` / `sessions inspect <id>` (non-interactive, scriptable byproduct).** `--agent`, `--filter <substr>` (title/cwd), `--root <dir>` (repeatable; overrides defaults), `--json`. `inspect --json` emits `{schema_version:'0.1', session, transcript}`. Unknown id → stderr + exit 1 (matches existing `provider inspect`). These exist for CI/piping, not as the demo.
- Dependency: `@rivus/agent-sessions` (`workspace:*`, bundled). MoonBit core untouched.

### agent-task-loop (task-linked)
- Rewrite `tui/data/fs-session-provider.ts` to **compose** the core's `SessionRegistry` instead of owning the walk/parse. `getTranscript(id)` → `registry.getTranscript(id)` mapped through `toLines()`; `listAvailableSessionIds()` → `registry.list().map(s => s.id)`.
- `buildPreviewFromTask` and task→session id resolution (`executionSessionId`/`reviewSessionId`/`sessionId`) stay as-is. Only the generic discovery/parse underneath is swapped → **no TUI behavior change**, existing #42 tests stay green.
- Net flow: task → sessionId → `@rivus/agent-sessions` → transcript; `agent-finder-cli` uses the same core with no task at all.

---

## 4. Presentation Layer — `@rivus/cli-presentation` (#23)

New **internal** package `packages/cli-presentation` (`private: true`, bundled). Add exactly one tiny color/measure dependency (`picocolors` or hand-rolled ANSI) — decided in P1; package.json has none today.

> This is the one phase the critique and my own inspection agree is **ready today**. Confirmed against the repo: `scan-command.ts:24` prints a literal `"STATUS\tTYPE\tPROVIDER\tLOCATION"` header decoupled from `formatAgentRecordLine` at line 26 (the drift bug is real), `provider list` has no header, and `version`/`config_paths`/`evidence` are present on `AgentRecord` but dropped from human output.

### What it provides
- **`ColumnSchema`-driven table renderer** (header + accessor + min/max width + align). Header and rows derive from the **same** schema, killing the literal-header-drifts-from-row-formatter bug. Width-aware (`process.stdout.columns`, fallback 80), truncates with ellipsis.
- **Status theme**: closed union → `{symbol, color}`, reused for `AgentRecord.status` (`runnable|found|missing|unknown`) **and** `Session.agent` / heartbeat state. Color emphasis = at-a-glance triage (the #23 complaint).
- **Key-value block renderer** (replaces hand-built `provider inspect`; seeds `sessions inspect`).
- **Summary/counts renderer** (replaces `doctor` prose).
- **Grouping + sort** helper (agents by status; sessions by agent/recency).
- **Gating**: color only when `stdout.isTTY && !process.env.NO_COLOR`; plain fallback otherwise.
- **`--json` is never touched** — JSON stays the stable machine contract on its own branch; presentation sits only on the human branch.

### Migration (the #23 redesign)
- `scan` → table via `ColumnSchema` (STATUS/TYPE/PROVIDER/LOCATION) + status theme + group-by-status; `--verbose` surfaces the dropped `version`/`config_paths`/`evidence`.
- `provider list` → same renderer **with a header**.
- `provider inspect` → key-value block.
- `doctor` → summary/counts + themed warnings.
- Fold any `provider-help` argv handling into citty's native help.
- **Tests in lockstep:** `tests/cli.test.ts` asserts exact substrings (verified: `versioned-cli` at line 43, `toHaveLength(26)` at 56, `Total providers: 26` at 63). JSON-branch tokens stay intact; human-branch substrings move into the renderer's snapshot tests **in the same PR**.

### TUI reuse
The Ink TUI keeps Ink components but renders from the **same view-models** (status-theme map, column schema, truncation are framework-agnostic pure functions). `SessionPreview.tsx` / `TranscriptEntry` consume `TranscriptEntry[]` from the core directly.

---

## 5. Resume — feasible v1 vs deferred

Model resume as a **capability + command string**, not an action.

- **v1: print a copyable resume command.** `resumeCommand(id)` returns a per-provider string:
  - Codex → likely `codex resume <id>` — **verify the exact flag against the installed `codex --help` before hardcoding** (project discipline: don't trust memory of CLI flags).
  - Claude → likely `claude --resume <id>` — **verify** the same way.
  - OpenCode → **doubly blocked**: ids are `ses_…` (not UUID) and the transcript lives in SQLite, so even *constructing* the command requires reading the db first. Returns `null` → "resume not supported" in v1 unless SPIKE-OC lands.
- **Capability flag** `Session.resumable` lets CLI + TUI show/hide the affordance without attempting anything unsafe.

> **Resume-coverage honesty (accepting the critique).** Don't model a uniform 3-tool capability. State plainly: **v1 resume realistically covers 2 of 3 tools (Codex, Claude); OpenCode is `resumable: false` until SPIKE-OC.**

> **MoonBit-coupling correction (accepting the critique).** The draft derived the resume binary from `@rivus/agent-finder-core` (MoonBit), creating a TS→MoonBit read dependency inside `agent-sessions`. Unnecessary: binary names are well-known per tool, and the CLI layer already imports core. **Inject the command/binary string from the CLI layer into `agent-sessions`** so the core stays dependency-light and standalone-testable. `agent-task-loop` injects its own.

- **Deferred (P6)**: actually spawning the agent (pty/stdio handoff), in-TUI resume, `--exec`, and OpenCode resume.

---

## 6. OpenCode is a research spike, not an implementation task

> **The single biggest correction.** Verified on this machine: `~/.local/share/opencode/` contains **`opencode.db` (SQLite, ~29MB)** with tables `session`, `message`, `part`, `project`, etc.; session ids are **`ses_1d168a0e4ffe…` base62, not UUIDs**; the only on-disk JSON is `storage/session_diff/ses_*.json` (mostly empty `[]`), and **there is no `.jsonl` transcript and no `message/` directory**. This breaks three draft assumptions simultaneously: the UUID + `.jsonl` fs-index cannot match it; `getTranscript` has no file to parse; and `transcript.ts` is not "fully generic." The draft's "one salvageable datum (the opencode root)" points at a directory the proposed parser physically cannot read.

**SPIKE-OC (parallel, blocking gate for any OpenCode support):**
1. Read-only inspect `opencode.db`: confirm `session.id` format, how `message`/`part` rows join to a session, and how to reconstruct an ordered transcript.
2. Determine whether OpenCode exposes a resume CLI keyed by `ses_…` (check `opencode --help`).
3. Decide the dependency: a tiny SQLite reader (e.g. `better-sqlite3` / `node:sqlite`) on a **separate provider code path**, opened **read-only** (the db has `-wal`/`-shm`; never write).
4. Output: a written go/no-go. **If no-go, v1 ships Codex + Claude only and the UI labels OpenCode "not yet supported."** No OpenCode work merges before this spike.

---

## 7. Phased Roadmap (each ships independently)

> **P2 split (accepting the critique).** The draft's P2 bundled a parser rewrite, an fs-index generalization, two-to-three providers (one needing SQLite), and a registry into one PR — too big, and it gates everything downstream. Split into P2a/P2b/P2c so a stall in one (especially anything OpenCode) doesn't block P3/P4.

### P0 — re-derive #31 disposition from the real diff

> **#31 rationale correction (accepting the critique).** The draft's "1-behind/15-ahead, ~9500 phantom deletions, conflicts predating #29/#42" is fabricated. Verified via `gh`: base `main`, **+197/-1 across 9 small files** (`session-list-command.ts +44`, `discover-sessions.ts +79`, `cli.test.ts +34`, a changeset, README). No phantom deletions, no 9500-line conflict.
>
> Closing it may still be right (it predates the mature `agent-task-loop` layer and uses a flat record model we're superseding), but the decision must rest on the **real** diff. Verified salvage items: (a) the `{schema_version:'0.1', sessions:[…]}` JSON contract shape, (b) the `mkdtemp` fake-root integration-test template, (c) the opencode **directory** as a pointer — **with the corrected understanding that it's a SQLite db, which #31's filesystem approach also could not read.** Re-read #31's actual `discover-sessions.ts` before closing; transcribe verified notes into #25.

| Phase | PR | Content | Depends on |
|---|---|---|---|
| **P0** | (issue housekeeping) | Re-derive #31 disposition from real diff; close or rebase on evidence; transcribe verified salvage notes into #25. | — |
| **P1** | `feat: cli-presentation + migrate scan/provider/doctor (#23)` | Internal presentation package; migrate output; tests in lockstep. **Ships visible value immediately, no session work.** | — |
| **P2a** | `feat: session model + transcript parser rewrite` | `Session`/`TranscriptEntry` types; **rewrite** parser to structured entries; `toLines()` shim with golden-output test; move `session-tail`/`heartbeat` helpers. | — |
| **P2b** | `feat: generalize bounded fs-index to Session metadata` | `internal/fs-index.ts`: `id→Session`, agent-namespaced to avoid cross-root UUID shadowing; Codex/Claude roots only. | P2a |
| **P2c** | `feat: SessionRegistry + Codex/Claude providers` | Registry, injectable roots, two filesystem providers; fake-root unit tests. | P2b |
| **SPIKE-OC** | (spike, parallel) | Read `opencode.db`; decide SQLite reader + resume feasibility; go/no-go. Blocks all OpenCode work. | — |
| **P3** | `refactor: agent-task-loop composes agent-sessions` | Swap TUI `fs-session-provider` internals to the core via `toLines()`. No TUI behavior change; #42 tests stay green. | P2c |
| **P4** | `feat: interactive sessions browsing TUI (#25)` | **Headline** Ink browser (list + trace preview + keyboard nav + resume affordance) on P1 view-models; thin `sessions list/inspect --json` for scripting. | P1, P2c |
| **P5** | `feat: sessions resume (print)` | `resumeCommand` per provider; **Codex/Claude verified against `--help`**; binary injected from CLI layer (no MoonBit dep); `resumable` surfaced. OpenCode = not supported unless SPIKE-OC landed. | P2c, P4 |
| **P6** *(later)* | `feat: richer trace view + opencode + exec resume` | Higher-fidelity `TranscriptEntry` (`tool_result`, code blocks), in-TUI scroll/search, `--exec` resume, OpenCode provider (if SPIKE-OC green). | P3–P5, SPIKE-OC |

**Ordering rationale:** P1 delivers the #23 win with zero session dependency and is the only phase ready today. P2a→P2b→P2c is a clean dependency chain that unblocks both consumers. P3 and P4 run in parallel after P2c. P5 layers print-only resume on the browser. SPIKE-OC runs in parallel from day one and gates all OpenCode work into P6.

---

## 8. Risks & Open Questions

- **OpenCode is SQLite, not JSONL (verified).** Highest-impact correction. Mitigation: SPIKE-OC gates all OpenCode work; v1 can ship Codex + Claude and label OpenCode unsupported. **Open: does `opencode` expose a resume CLI keyed by `ses_…`, and is `node:sqlite` sufficient or do we need `better-sqlite3`?**
- **Parser rewrite, not a lift (verified).** `transcript.ts` is lossy strings dropping `tool_result`/timestamps. P2a is a rewrite + `toLines()` adapter; golden-output test guards the `agent-task-loop` renderer.
- **Cross-tool format drift.** Codex `{payload}` vs Claude `{message}` already diverge; OpenCode is a third shape entirely. Providers isolate per-tool parsing; the parser skips unknown lines (`null`).
- **Agent attribution.** Root-attribution is reliable for default installs but not collision-proof; index is agent-namespaced and custom `--root` falls back to `unknown`. No oversold "fix" claim.
- **Resume correctness.** Verify each tool's resume flag against the installed `--help` before hardcoding. Wrong command is worse than none → print-only v1, `resumable:false` when unverified; realistically 2 of 3 tools.
- **No new published packages.** Both new packages are `private: true` and bundled via rslib into `agent-finder-cli`'s dist; `agent-task-loop` consumes via `workspace:*`. Extract + publish only on a real third consumer.
- **No MoonBit coupling in the core.** Resume binaries injected from the CLI layer; `agent-sessions` stays dependency-light and standalone-testable.
- **Test lockstep (#23).** `tests/cli.test.ts` exact substrings (`versioned-cli`, `26`, `Total providers: 26`) break on redesign; every presentation PR updates tests in the same commit, keeping JSON-branch tokens intact.
- **Scope creep on fidelity / interactivity.** Hold v1 at a navigable two-pane browser with preview-grade traces. Full Vim-modal viewport, in-trace search, and `--exec` resume are P6.

