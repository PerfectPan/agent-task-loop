# RFC 0007: `source` management command

## Status

Proposed (implemented alongside this RFC per maintainer request)

## Summary

Adds a `source` command group to add / list / remove task sources on an
**existing** config, so users don't have to hand-edit
`~/.agent-task-loop/config.json`. Today `init` only creates a fresh config and
refuses when one exists ("Global config already exists …"), leaving no
supported path to add a second source — or a second GitHub repository — after
the first setup.

- `agent-task-loop source list` — show configured sources and the default.
- `agent-task-loop source add` — add a GitHub repo or Feishu Base, merging into
  the existing config without touching unrelated blocks. Adding a GitHub repo
  when one is already configured **appends to `repositories[]`** (the multi-repo
  entry point from RFC 0005).
- `agent-task-loop source remove <id>` — remove a source (keeping ≥1).

`init`'s "already exists" message is updated to point at `source add`.

## Motivation

RFC 0005 made `githubIssues` optional and multi-repo capable, but the only way
to populate it after `init` is manual JSON editing — error-prone (the
`projects`/`repositories` key-naming gotcha) and a bad first-run experience
(this RFC was prompted by exactly that dead end). A first-class command also
gives multi-repo a real entry point (`source add` a second repo) instead of
documentation that says "hand-edit `repositories[]`".

## Goals

- Add/list/remove sources on an existing config; create the config if absent.
- Never clobber unrelated config (`feishu` stays when adding GitHub and vice
  versa; `projects` / `repositories` / `agents` untouched).
- Adding a GitHub repo to an existing GitHub config appends to `repositories[]`,
  de-duplicating by `owner/repo`.
- Refuse to remove the last source (config must keep ≥1, per RFC 0005).
- Non-interactive flags for scripting; interactive prompts as a TTY fallback.
- The resulting file always validates against `appConfigSchema` before write.

## Non-Goals

- Editing `projects` / `repositories` / `agents` (still hand-edited / future
  work). `source` only manages the task-source blocks.
- Per-repo `token` / `defaultAgent` override editing beyond what `add` accepts.
- Changing how sources are consumed at runtime (RFC 0005/0006 unchanged).

## Proposed Design

### Pure config ops (`config/source-config.ts`)

Tested in isolation; the command is thin I/O over these.

```ts
export interface SourceSummary { id: string; label: string; isDefault: boolean; }

/** feishu first (when present), then one entry per GitHub repo. Default = feishu
 *  when configured, else the first GitHub repo. */
export function listSources(config: EditableConfig): SourceSummary[];

/** Add/merge a GitHub repo. No githubIssues yet → single shorthand; otherwise
 *  normalize to `repositories[]` and append. Throws if `owner/repo` already
 *  present. */
export function addGitHubRepo(
  config: EditableConfig,
  repo: { owner: string; repo: string; defaultAgent?: string; token?: string },
): EditableConfig;

/** Set the feishu block. Throws if feishu already configured. */
export function addFeishuSource(
  config: EditableConfig,
  feishu: { baseToken: string; tableId: string; viewId?: string },
): EditableConfig;

/** Remove `'feishu'` or `'github:<owner>/<repo>'`. Throws if not found or if it
 *  would leave zero sources. */
export function removeSource(config: EditableConfig, id: string): EditableConfig;
```

`EditableConfig` is the pre-validation object shape (all source blocks optional
plus `projects`/`repositories`/`agents`). Ops return a new object (no mutation
of the input).

GitHub source id is `github:<owner>/<repo>` — the same id RFC 0005/0006 already
use as the provider source, so `source list` and the TUI source filter speak the
same language.

### Command (`commands/source.ts`)

A citty command with nested `subCommands: { list, add, remove }`, registered as
`source` in `cli.ts`. All three accept `--config <path>` (defaults to the global
`~/.agent-task-loop/config.json` via `globalConfigPath()`).

- **`list`**: load config, print each source (`*` marks default). Empty/missing
  config → friendly "no sources; run `source add`".
- **`add`**: flags `--type github|feishu`, and for github `--owner` / `--repo`
  (prefilled from `gh repo view` when omitted and interactive) / `--default-agent`
  (default `codex`); for feishu `--base-token` / `--table-id`. Missing required
  values in a TTY → prompt; non-TTY with missing values → error. Reads the config
  (or `{projects:{},repositories:{},agents:{}}` if absent), applies the op,
  validates with `appConfigSchema`, writes. Prints the resulting source list.
- **`remove <id>`**: applies `removeSource`, validates, writes.

Writes reuse the same JSON-pretty + `mkdir -p` as `init`.

### `init` touch-up

When the global config already exists, `init` prints:
`Global config already exists at <path>. Use \`agent-task-loop source add\` to add a source.` and exits 0 (unchanged otherwise).

## Behavior Matrix

| State | `source add github o/r` |
| --- | --- |
| no config | create config with `githubIssues = {owner,repo,defaultAgent}` |
| feishu only | add `githubIssues`, keep `feishu` (now both sources) |
| github single (o/a) | normalize to `repositories:[o/a, o/r]` |
| already has o/r | error "already configured" (no change) |

## Testing

- **source-config (pure)**: list ordering + default; add github to empty/feishu/
  single(→repositories[])/duplicate(throws); add feishu to empty/duplicate(throws);
  remove feishu / a github repo / unknown(throws) / last-source(throws); ops don't
  mutate input.
- **command (non-interactive, tmp `--config`)**: `add --type github --owner --repo`
  writes a valid config; `add` second repo appends; `list` prints the default
  marker; `remove` drops one; the written file parses under `appConfigSchema`.
- **init**: existing-config message mentions `source add`.

## Alternatives Considered

- **Make `init` additive when config exists.** Overloads "init" semantics; a
  dedicated `source` group reads clearer and gives `list`/`remove` a home.
- **Only document hand-editing `repositories[]`.** The dead-end that motivated
  this RFC; rejected.

## Compatibility

Purely additive — a new command + pure helpers. No change to existing commands
beyond `init`'s message. No config migration.
