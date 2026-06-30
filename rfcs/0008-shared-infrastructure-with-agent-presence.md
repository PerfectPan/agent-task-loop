# RFC 0008: Shared Agent Infrastructure with agent-presence

## Status

Proposed

## Summary

`PerfectPan/agent-presence` (`@rivus/agent-presence`, v0.6.1) and this monorepo
independently re-implement three pieces of the same infrastructure:

1. **The catalog of code agents and their well-known on-disk paths** — already
   modelled in `@rivus/agent-finder-core` (published, v0.1.2), but re-hardcoded
   in agent-presence's hook installers.
2. **Transcript-root resolution + `.jsonl` directory walking** — modelled in
   `@rivus/agent-sessions` (private, v0.0.0) and re-implemented in
   agent-presence's `src/usage/`.
3. **Per-agent transcript parsing** — `@rivus/agent-sessions` parses Claude and
   Codex `.jsonl` for *messages* and explicitly drops token counts, while
   agent-presence parses the *same files* for *token usage*.

This RFC proposes that agent-presence consume the published `@rivus` packages
instead of duplicating, defines which capability belongs in which package, and
lays out a phased rollout whose hard prerequisite is publishing
`@rivus/agent-sessions`.

This is a research RFC. It changes no `src/` code; it proposes a direction and
the package boundaries to get there.

## Motivation

The two repos already share the same mental model — "a known set of code agents,
each with a home-dir config directory and a `.jsonl` transcript store" — but
encode it twice. Every new agent, every path convention change (e.g. Codex
moving sessions to `archived_sessions`), and every transcript-format quirk has
to be tracked in both places. `@rivus/agent-finder-core` is published and could
already serve the catalog half; `@rivus/agent-sessions` holds the
transcript-walking half but cannot be consumed because it is private.

The duplication is concrete and citable (see the table below), not speculative.

## Duplication Table (file-level evidence)

Paths are repo-relative. agent-presence paths are under the cloned
`PerfectPan/agent-presence` at v0.6.1 (`package.json:3`); monorepo paths are
under `packages/`.

| # | Capability | This monorepo (owner) | agent-presence (duplicate) | Notes |
|---|---|---|---|---|
| 1 | Agent catalog + well-known paths | `agent-finder/agent_discovery_core/catalog/providers.mbt` — `claude-code` `~/.claude`, mcp `~/.claude/settings.json` (`:18-26`); `codex` `~/.codex`, `~/.codex/config.toml` (`:33-41`); `gemini-cli` `~/.gemini`, `~/.gemini/settings.json` (`:111-119`); `opencode` `~/.config/opencode/opencode.json` (`:4-14`); `pi` `~/.pi` (`:99-101`) | Hook installers hardcode the same families: `~/.claude/settings.json` (`scripts/install-claude-hook.ts:10`), `~/.codex/hooks.json` (`scripts/install-codex-hook.ts:26`), `~/.gemini/settings.json` (`scripts/install-gemini-hook.ts:10`), `~/.config/opencode/opencode.json` (`scripts/install-opencode-plugin.ts:11`), `~/.pi/agent/settings.json` (`scripts/install-pi-extension.ts:9`) | **Partial** overlap — agent identity and config-dir roots match; specific filenames diverge (finder lists Codex `config.toml`; presence writes `hooks.json`). See gaps. |
| 2 | Home-dir / `~` path expansion | `agent-finder/src/support/expand-path.ts:1-9`; MoonBit twin `agent_discovery_core/scanner/expand_path.mbt:1-10` | Per-file `homedir()` + `join()` (`scripts/install-claude-hook.ts:2-3`, `src/usage/scan-claude.ts:1-2`, …); CLI resolution `src/installers.ts:628-643` | Same `node:os`/`node:path` primitive re-derived everywhere. |
| 3 | Transcript-root resolution | `agent-sessions/src/session/fs-index.ts:35-40` `defaultSessionRoots` → `~/.codex/sessions`, `~/.claude/projects`, always derived from `homedir()`; duplicated in `src/session/provider.ts:120,127-131` (Claude root `join(home, ".claude", "projects")`) | `~/.claude/projects` (`src/usage/scan-claude.ts:13-20` `defaultClaudeRoot`, **honours `CLAUDE_CONFIG_DIR`**), `~/.codex/sessions` + `~/.codex/archived_sessions` (`src/usage/scan-codex.ts:9,20`), `~/.pi/agent/sessions` (`src/usage/scan-pi.ts:9`) | **Near**-match for Claude + Codex `sessions`, not exact. Divergences: presence's Claude root respects `CLAUDE_CONFIG_DIR` while sessions hardcodes `~/.claude` off `homedir()`; presence also scans Codex `archived_sessions` (sessions does not) and adds Pi (sessions has no Pi provider). |
| 4 | `.jsonl` directory walking | `agent-sessions/src/session/fs-index.ts:53-95` `buildFsIndex` — recursive `walk`, `readdir(withFileTypes)`, swallow unreadable dirs, depth/budget caps (`:7-8`) | `agent-presence/src/usage/read-jsonl.ts:12-44` `listJsonlFiles`/`walk` — recursive `readdir(withFileTypes)`, swallow unreadable dirs | Same shape; selection filter differs: sessions matches a UUID filename regex (`fs-index.ts:10`), usage matches `*.jsonl` + `mtimeMs >= sinceMs` (`read-jsonl.ts:32-38`). |
| 5 | `.jsonl` line reading | `agent-sessions/src/transcript/parse.ts:110-119` (`split("\n")` + `JSON.parse`) | `agent-presence/src/usage/read-jsonl.ts:51-73` `forEachJsonl` (`readline` stream + `JSON.parse`, skip malformed) | Both turn a transcript file into parsed JSON objects, line by line. |
| 6 | Per-agent transcript parsing | `agent-sessions/src/transcript/parse.ts:65-107` — Codex `payload.type` shapes (`:75-95`), Claude `message` shape (`:98-106`); **drops `token_count`** at `:94` | Claude `extractRecord` reads `message.model` + `usage.*` (`src/usage/scan-claude.ts:65-116`); Codex cumulative-diff over `payload.type === 'token_count'` (`src/usage/scan-codex.ts:43-104`); Pi `extractMessage` (`src/usage/scan-pi.ts:33-78`) | **Complementary** on identical files: sessions reads roles/messages and throws away exactly the `token_count` payload that usage scanning exists to read. |
| 7 | Agent-record / session types | `agent-finder/src/contracts/types.ts` (`ProviderSpec`, `AgentRecord`, `Evidence`); `agent-sessions/src/session/types.ts` (`Session`, `AgentKind`), `src/transcript/types.ts` (`TranscriptEntry`) | `agent-presence/src/usage/types.ts` (`UsageRecord`, `UsageSource = 'claude'\|'codex'\|'pi'`, `:1`) | Three independent enumerations of "which agents exist." |

### Cross-repo dependency reality

- agent-presence's only runtime dependency is `@clack/prompts` (`package.json:65`);
  it depends on **no** `@rivus/*` package today. The `@rivus/agent-presence`
  strings in `src/installers.ts` are its own self-references, not imports.
- `@rivus/agent-finder-core` is **published** and public (`packages/agent-finder/package.json` `"private": false`, v0.1.2) — consumable now.
- `@rivus/agent-sessions` is **private/unpublished** (`packages/agent-sessions/package.json` `"private": true`, v0.0.0) and has no runtime deps — **not** consumable until published.

## Goals

- Establish a single source of truth for "which code agents exist and where
  their config/transcripts live," consumed by both repos.
- Let agent-presence delete its hardcoded path catalog and `.jsonl`-walking code
  in favour of published `@rivus` packages.
- Define crisp package boundaries so the catalog, the filesystem/transcript
  layer, and consumers (presence's installers + usage) compose without circular
  dependencies.
- Keep every step additive and independently shippable.

## Non-Goals

- Rewriting agent-presence's usage *accounting* (window math, pricing in
  `src/usage/pricing.ts`, cumulative-diff logic) — that stays in agent-presence.
- Moving hook *installation* logic into this monorepo. Installers stay in
  agent-presence; only the *path/catalog data* they consume is shared.
- Changing `@rivus/agent-finder-core`'s MoonBit-based build (RFC 0004); catalog
  extensions are additive `.mbt` edits compiled to the existing JS ABI.
- Merging the two repositories.
- Adding agents not already present in at least one repo.

## Proposed Design

### Package boundaries

| Capability | Owning package | State today | Action |
|---|---|---|---|
| Agent identity, config-dir roots, settings/MCP paths, install conventions | `@rivus/agent-finder-core` | Published; catalog in `providers.mbt` | **Extend** catalog with transcript-root + settings/hooks-file fields (additive to `ProviderSpec`). |
| `~`/home expansion, `$PATH` command resolution | `@rivus/agent-finder-core` | `src/support/expand-path.ts`, `src/infrastructure/resolve-command.ts` | Re-export as the shared primitive; presence imports instead of re-deriving. |
| Transcript-root list, `.jsonl` walking, line parsing, normalized entries | `@rivus/agent-sessions` | **Private** | **Publish**, then make it the walker/parser both consumers share. |
| Token-usage extraction (the `token_count` / `usage` fields) | `@rivus/agent-sessions` (raw entry exposure) → agent-presence (accounting) | sessions drops `token_count` (`parse.ts:94`); presence parses it | sessions exposes raw line objects (or a usage-bearing entry); presence computes totals/pricing on top. |
| Hook install/uninstall, pricing, window accounting | **agent-presence** | Owned there | Unchanged; just sourced from `@rivus` data. |

Rationale: `agent-finder-core` already *is* the catalog — it knows every agent
and its config roots. `agent-sessions` already *is* the transcript layer. The
clean split is **"who/where" (finder) vs "read the transcripts" (sessions)**,
with agent-presence as a pure consumer of both. No new package is required for
phases 1–2; a low-level `fs`/path-primitives package is only worth extracting if
duplication remains after (see Alternatives).

### The two extensions that unlock consumption

1. **Catalog → transcript + tooling paths (finder).** Today the catalog stores
   *config-dir* roots (`~/.claude`, `~/.codex`) but not *transcript* roots
   (`~/.claude/projects`, `~/.codex/sessions`) and not the per-agent
   settings/hooks filenames presence's installers need (e.g. Codex
   `hooks.json`). Add these as new optional `ProviderSpec` fields so one record
   describes an agent end to end. This is purely additive to the MoonBit catalog
   and its compiled JS ABI.

2. **Sessions → expose usage-bearing entries (sessions).** `parse.ts:94`
   intentionally discards the `token_count` payload — the exact data
   agent-presence needs. Add a non-lossy path (e.g. surface raw parsed line
   objects, or a `TranscriptEntry` variant carrying `usage`) so presence's
   accounting reads it without re-walking the files.

### Target consumption in agent-presence

- Installers (`scripts/install-*.ts`) read settings/hooks paths from the finder
  catalog instead of literals at `install-claude-hook.ts:10`,
  `install-codex-hook.ts:26`, etc.
- `src/usage/` replaces `read-jsonl.ts` + the per-file root functions with
  `@rivus/agent-sessions` walking/entry APIs; `scan-*.ts` keep only the
  usage-field extraction and pricing.

## Gaps and Uncertainties (explicitly unverified or divergent)

- **Codex `hooks.json` is not in the finder catalog.** Finder lists Codex
  `~/.codex/config.toml` (`providers.mbt:33-41`); presence writes
  `~/.codex/hooks.json` (`install-codex-hook.ts:26`). Sharing requires adding a
  hooks-file field — the catalog cannot serve installers as-is.
- **`CLAUDE_CONFIG_DIR` override is presence-only.** presence's
  `defaultClaudeRoot` (`scan-claude.ts:13-20`) resolves the Claude root from
  `CLAUDE_CONFIG_DIR` when set (ccusage-compatible), falling back to
  `~/.claude/projects`. `@rivus/agent-sessions` always derives `~/.claude` from
  `homedir()` (`fs-index.ts:35-40`, `provider.ts:127-131`) with no env override.
  A migration that swaps presence's root for the sessions root **would lose this
  coverage semantic** — sharing requires teaching sessions about
  `CLAUDE_CONFIG_DIR` (or parameterizing the root) before presence can rely on it.
- **Codex `archived_sessions` is presence-only.** `scan-codex.ts:20` scans it;
  `agent-sessions/fs-index.ts:35-40` does not. Sessions would under-count long
  windows until it adds the second root.
- **Pi has no `agent-sessions` provider.** Presence scans `~/.pi/agent/sessions`
  (`scan-pi.ts:9`) and the finder catalog knows `~/.pi` (`providers.mbt:99-101`),
  but `defaultRegistry()` wires only Codex + Claude (`registry.ts`). A Pi
  provider is new work.
- **Selection-filter mismatch (item 4).** sessions selects by UUID filename;
  usage selects by `*.jsonl` + mtime window. A shared walker must parameterize
  the filter rather than assume either.
- **Parsing is complementary, not identical.** sessions and presence read
  different fields from the same lines; unifying them needs the non-lossy entry
  API above, not a literal merge.
- **Not executed.** Findings come from reading source at the cloned agent-presence
  HEAD (v0.6.1) and this worktree; line numbers may drift as either repo evolves.
  No build or runtime cross-check was performed.

## Alternatives Considered

- **Do nothing / keep duplicating.** Cheapest now; the recurring cost is
  every new agent and path convention being edited in two repos with no
  compiler linking them. Rejected for a maintained, growing agent set.
- **Publish only `agent-finder-core` usage; leave transcript walking duplicated.**
  Captures items 1–2 and 7 but leaves the largest overlap (items 3–6, the
  `.jsonl` layer) duplicated. Reasonable as an interim stop if publishing
  `agent-sessions` slips.
- **Extract a new low-level `@rivus/agent-fs` (path expansion + jsonl walking).**
  Cleaner layering, but a third package and more release surface. Defer until
  phases 1–2 prove the primitives are still duplicated.
- **Merge the repos.** Out of scope; orthogonal to removing duplication.

## Compatibility

- Catalog extensions add optional `ProviderSpec` fields — additive, no consumer
  break; existing finder output is unchanged when new fields are absent.
- Exposing raw/usage entries in `agent-sessions` is additive to its API.
- Publishing `agent-sessions` flips `"private": true → false` and assigns a real
  version; no behavior change for existing monorepo consumers.
- agent-presence migration is internal; its published CLI/behavior is unchanged.

## Rollout

- **Phase 0 — Prerequisite: publish `@rivus/agent-sessions`.** Flip `private`,
  version, ship under the npm publish flow (RFC 0001). Until this lands, only
  the finder-half (Phase 1) is consumable.
- **Phase 1 — Catalog as source of truth.** Extend the MoonBit catalog with
  transcript-root + settings/hooks-file fields; agent-presence installers and
  root resolution consume `@rivus/agent-finder-core`, deleting hardcoded literals
  (items 1–2, 7). No dependency on Phase 0.
- **Phase 2 — Shared transcript layer.** Add the non-lossy entry API to
  `agent-sessions`; agent-presence's `src/usage/` consumes its walking + entry
  APIs and keeps only usage extraction + pricing (items 3–6). Depends on Phase 0.
  Close the gaps: `CLAUDE_CONFIG_DIR`-aware Claude root, Codex `archived_sessions`
  root, Pi provider, parameterized file filter.
- **Phase 3 — Optional primitive extraction.** If path/jsonl primitives are
  still duplicated after 1–2, extract `@rivus/agent-fs`; otherwise close.

Each phase is independently shippable and reversible. Phase 1 can proceed
immediately; Phases 2–3 gate on publishing `@rivus/agent-sessions`.
