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
- lark-cli
- GitHub CLI (`gh`) authenticated for Pull Request creation
- Locally executable coding agents such as `claude`, `codex`, `coco`, or `glm`

## Config

Config discovery checks:

- `task.config.ts` in the current directory or its parents
- `AGENT_TASK_LOOP_CONFIG`
- `task.config.ts` in the package directory

Start from the example:

```bash
cp task.config.example.ts task.config.ts
```

Then replace the example Feishu table values and local repository paths with real values.

## Initialize Task Table Schema

Check fields:

```bash
npx agent-task-loop schema
```

Create missing fields:

```bash
npx agent-task-loop schema --apply
```
