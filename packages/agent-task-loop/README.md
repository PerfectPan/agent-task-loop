# Agent Task Loop CLI

Agent Task Loop is a local CLI for running AI coding agent task delivery workflows.

It connects your task trackers (a Feishu Base table today, GitHub Issues optionally) to local coding agents, then drives a task through execution, review, rework, branch publishing, and Pull Request handoff. Tasks stay owned by their source — the CLI and TUI are an integration layer, not a system of record — so writes route back to the backend each task came from.

## Local CLI

Install dependencies from the monorepo root:

```bash
pnpm install
```

Then run the local CLI:

```bash
npx --no-install @rivus/agent-task-loop --help
```

From npm, run:

```bash
npx @rivus/agent-task-loop --help
```

Use `--no-install` when you want to force the repo-local binary:

```bash
npx --no-install @rivus/agent-task-loop --help
```

## Commands

- `npx agent-task-loop sync`
- `npx agent-task-loop schema`
- `npx agent-task-loop schema --apply`
- `npx agent-task-loop create --task TASK-101 --title "Fix login" --project web --agent codex --priority 3`
- `npx agent-task-loop start --task TASK-101`
- `npx agent-task-loop watch --task TASK-101`
- `npx agent-task-loop resume --task TASK-101`
- `npx agent-task-loop complete --task TASK-101`

Commands with machine-readable output support `--json` for scripts and agents:

```bash
npx agent-task-loop sync --json
npx agent-task-loop schema --json
npx agent-task-loop schema --apply --json
npx agent-task-loop create --task TASK-101 --title "Fix login" --project web --agent codex --priority 3 --json
npx agent-task-loop cleanup --task TASK-101 --json
npx agent-task-loop complete --task TASK-101 --json
```

## Complete Flow

`complete` closes a task that is already in `待发布` or `待验收`.

The flow is:

1. Reuse the task workspace branch and commit state.
2. Commit any pending workspace changes with an AI-generated commit message.
3. Push the remote branch and verify the remote head.
4. Create or reuse a GitHub Pull Request with `gh`.
5. Update the Pull Request body with a generated delivery summary.
6. Write branch, commit, Pull Request, and completion metadata back to the task table.
7. Move the task to `已完成`.

## Local Requirements

- Node.js 20+
- pnpm
- GitHub CLI (`gh`) authenticated for Pull Request creation (and as the GitHub-Issues token source)
- lark-cli — only when using a Feishu task source
- Locally executable coding agents such as `claude`, `codex`, `coco`, or `glm`

## Config

Config is **JSON only** and resolved from exactly three places, in order:

1. `--config <path>` (explicit)
2. `AGENT_TASK_LOOP_CONFIG` environment variable
3. `~/.agent-task-loop/config.json` (the global config; the default)

There is no per-directory `task.config.*` discovery. The fastest way to create
the global config is:

```bash
npx agent-task-loop init
```

`init` asks which task source(s) to use — GitHub Issues, Feishu Base, or both —
and writes `~/.agent-task-loop/config.json`. Fill in `projects` and
`repositories` afterward. See `config.example.json` for the full shape.

To add sources to an **existing** config (init refuses to overwrite), use the
`source` command instead of hand-editing:

```bash
agent-task-loop source list                                   # show sources + default
agent-task-loop source add --type github --owner you --repo your-repo
agent-task-loop source add --type github --owner you --repo another-repo  # appends to repositories[]
agent-task-loop source add --type feishu --token <base> --table <tableId>
agent-task-loop source remove github:you/your-repo
```

`source add` merges into the config without touching unrelated blocks (adding a
second GitHub repo appends to `repositories[]`); `source remove` keeps at least
one source. Run with no flags in a terminal for interactive prompts.

### Task sources

Configure **at least one** of `feishu` / `githubIssues`:

- **GitHub-only** — set `githubIssues` (`owner`, `repo`, optional `defaultAgent`),
  omit `feishu`. The token is resolved from `githubIssues.token`, then
  `GITHUB_TOKEN`, then `gh auth token` — so a `gh`-authenticated machine needs
  no token in config. Tasks created from the TUI become GitHub issues (the
  issue number/URL link back to the task).

  **Multiple repositories** — instead of a single `owner`/`repo`, list several
  under `repositories`; each becomes its own `github:<owner>/<repo>` source and
  shows up as a separate option in the TUI's create-form source selector. A
  top-level `token` / `defaultAgent` applies to all; a repo may override
  `defaultAgent`:

  ```json
  {
    "githubIssues": {
      "defaultAgent": "codex",
      "repositories": [
        { "owner": "your-org", "repo": "service-a" },
        { "owner": "your-org", "repo": "service-b", "defaultAgent": "claude" }
      ]
    }
  }
  ```

  **Which issues become tasks** — to avoid adopting every issue in a repo, an
  issue is treated as a task only when it opts in: it carries the hidden
  `<!-- task-id: ... -->` marker (issues created through this tool) **or** an
  `agent:<name>` label (the way you hand off an existing issue). Issues with
  neither are ignored.
- **Feishu-only** — set `feishu` (`baseToken`, `tableId`), omit `githubIssues`.
- **Both** — tasks are read from both; writes route back to each task's owning
  backend, defaulting new creates to Feishu.

## Manage tasks in the TUI

```bash
npx agent-task-loop tui
```

Press `n` to open the new-task form. With more than one configured source a
selector lets you choose where to publish. When a `claude` agent is configured,
press `Ctrl+R` on the form to have the AI refine the description before
publishing.

When the board spans more than one source (e.g. several GitHub repos), each row
shows a compact source tag (the repo short name) and the detail pane shows the
full `github:<owner>/<repo>`. Press `s` to open the **source filter** — a
multi-select popup (Space toggles, `a` all, Enter applies) to focus on one or
more repos; the active selection appears as a `src:…` chip in the header. The
`/` text filter also matches source/repository.

## Initialize Task Table Schema (Feishu only)

Feishu task tables need a schema; GitHub Issues do not (`schema` prints a notice
and exits when no Feishu source is configured).

Check fields:

```bash
npx agent-task-loop schema
```

Create missing fields:

```bash
npx agent-task-loop schema --apply
```
