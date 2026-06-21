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
- `npx agent-task-loop start --task TASK-101`
- `npx agent-task-loop watch --task TASK-101`
- `npx agent-task-loop resume --task TASK-101`
- `npx agent-task-loop complete --task TASK-101`

Summary commands support `--json` for scripts and agents:

```bash
npx agent-task-loop sync --json
npx agent-task-loop schema --json
npx agent-task-loop schema --apply --json
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

### Task sources

Configure **at least one** of `feishu` / `githubIssues`:

- **GitHub-only** — set `githubIssues` (`owner`, `repo`, optional `defaultAgent`),
  omit `feishu`. The token is resolved from `githubIssues.token`, then
  `GITHUB_TOKEN`, then `gh auth token` — so a `gh`-authenticated machine needs
  no token in config. Tasks created from the TUI become GitHub issues (the
  issue number/URL link back to the task).
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
