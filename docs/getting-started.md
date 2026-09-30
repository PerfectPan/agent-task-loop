# Getting Started

Agent Task Loop runs local coding agents through a task lifecycle: pick a task, create or reuse a workspace, execute, review, rework, publish, and clean up.

## Prerequisites

- Node.js 20 or newer
- pnpm
- GitHub CLI authenticated with access to the target repository
- `lark-cli` configured for Feishu Base access, when using a Feishu source
- At least one local coding agent command, such as `codex` or `claude`

## Install

From the repository root:

```bash
pnpm install
pnpm build
```

Run the local CLI without installing the package globally:

```bash
npx --no-install @rivus/agent-task-loop --help
```

Use the published package with:

```bash
npx @rivus/agent-task-loop --help
```

## First Run

1. Create the global config.

   ```bash
   npx --no-install @rivus/agent-task-loop init
   ```

2. Edit `~/.agent-task-loop/config.json` with your projects, repositories, and local agent commands. See [configuration.md](./configuration.md).

3. Check that the config can be loaded.

   ```bash
   npx --no-install @rivus/agent-task-loop sync
   ```

4. For a Feishu source, check the Base table schema.

   ```bash
   npx --no-install @rivus/agent-task-loop schema
   ```

5. Create missing fields if needed.

   ```bash
   npx --no-install @rivus/agent-task-loop schema --apply
   ```

6. Start a task.

   ```bash
   npx --no-install @rivus/agent-task-loop start --task TASK-101
   ```

7. Watch progress in another terminal.

   ```bash
   npx --no-install @rivus/agent-task-loop watch --task TASK-101
   ```

## Common Commands

```bash
npx --no-install @rivus/agent-task-loop run --agent codex
npx --no-install @rivus/agent-task-loop create --task TASK-101 --title "Fix login" --project web --agent codex --priority 3
npx --no-install @rivus/agent-task-loop start --task TASK-101
npx --no-install @rivus/agent-task-loop watch --task TASK-101
npx --no-install @rivus/agent-task-loop resume --task TASK-101
npx --no-install @rivus/agent-task-loop complete --task TASK-101
npx --no-install @rivus/agent-task-loop cleanup --task TASK-101
```

Use `--json` when another program needs stable output:

```bash
npx --no-install @rivus/agent-task-loop sync --json
npx --no-install @rivus/agent-task-loop schema --json
npx --no-install @rivus/agent-task-loop create --task TASK-101 --title "Fix login" --project web --agent codex --priority 3 --json
```
