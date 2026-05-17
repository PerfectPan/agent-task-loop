# Agent Workflow

This guide is for coding agents operating Agent Task Loop from this repository.

## Rules

- Use the CLI instead of reimplementing task state transitions.
- Run commands from the repository root when possible.
- Prefer `npx --no-install @rivus/agent-task-loop` so the repo-local package is used.
- Do not print or commit Feishu, GitHub, npm, or agent credentials.
- Use `--json` for commands that feed another program.

## Command Map

| Intent | Command |
| --- | --- |
| Validate config | `npx --no-install @rivus/agent-task-loop sync` |
| Validate schema | `npx --no-install @rivus/agent-task-loop schema` |
| Apply missing schema fields | `npx --no-install @rivus/agent-task-loop schema --apply` |
| Pick and run next task for an agent | `npx --no-install @rivus/agent-task-loop run --agent codex` |
| Start one task | `npx --no-install @rivus/agent-task-loop start --task TASK-101` |
| Watch one task | `npx --no-install @rivus/agent-task-loop watch --task TASK-101` |
| Resume task session | `npx --no-install @rivus/agent-task-loop resume --task TASK-101` |
| Complete accepted task | `npx --no-install @rivus/agent-task-loop complete --task TASK-101` |
| Clean completed workspace | `npx --no-install @rivus/agent-task-loop cleanup --task TASK-101` |

## Typical Flow

1. Run `sync` to confirm config discovery.
2. Run `schema` before the first task in a new table.
3. Use `start --task <TaskID>` when the user names a task.
4. Use `run --agent <agent>` only when the user wants the next pending task for an agent.
5. Use `watch --task <TaskID>` to stream task progress and logs.
6. Use `resume --task <TaskID>` when the user wants to reopen the execution or review session.
7. Use `complete --task <TaskID>` only after the task is ready for publish handoff.
8. Use `cleanup --task <TaskID>` after the task is completed and the workspace can be removed.

## JSON Output

Use JSON output for machine parsing:

```bash
npx --no-install @rivus/agent-task-loop sync --json
npx --no-install @rivus/agent-task-loop schema --json
npx --no-install @rivus/agent-task-loop schema --apply --json
npx --no-install @rivus/agent-task-loop cleanup --task TASK-101 --json
npx --no-install @rivus/agent-task-loop complete --task TASK-101 --json
```

`watch` streams logs and status snapshots. Treat it as a human-facing streaming command unless a future JSONL mode is added.

## Failure Handling

- If `sync` fails, fix config discovery or the config file before running task commands.
- If `schema` reports missing fields, run `schema --apply` only when the user expects the table to be modified.
- If a task already has an active runner, do not start another one. Use `watch` or `resume`.
- If a task has a stale runner, `start` can recover from the recorded runner state.
