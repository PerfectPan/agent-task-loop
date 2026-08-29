# @rivus/agent-orchestration

Register and occupy a multi-agent **run**: seats, turn-taking, shared context, and process spawn.

This package does not know tasks, Feishu, GitHub, or review loops. Callers (today: `@rivus/agent-task-loop`) pass a string key, a template id, and seat bindings.

## Status

Internal package (`private: true`). Not published yet.

Layout: `contracts/` and `domain/` are Node-free. File lock, `homedir`, and `execa` live in `infrastructure/`.

## API

```ts
const orch = createOrchestration({ baseDir });
orch.templates.register({
  id: 'classic-delivery',
  seats: ['impl', 'review'],
  allow: { start: 'impl' },
});

await orch.open({
  key: 'task:T-1',
  template: 'classic-delivery',
  bind: { impl: { cmd: 'grok' }, review: { cmd: 'codex' } },
  context: { goal: '…', ref: { taskId: 'T-1' } },
});

orch.observe('task:T-1', 'impl');
orch.allow('task:T-1', 'review');
await orch.spawn('task:T-1', 'review', { cwd });
orch.release('task:T-1');
```

A second `open` on the same key fails with `OrchestrationConflictError` (`orchestration-conflict`) while the lock holder is alive and the heartbeat is fresh.

Seat names are data. The kernel does not define `Team` or `Lead`.

## Domain model

`Run` is the aggregate root. Seats are entities inside the Run and cannot be
changed independently. Turn changes, command bindings (`cmd` and `args`), facts,
mail, process state, and release all pass through Run behavior before the
application service persists a snapshot. Binding environment variables remain
ephemeral execution input and are omitted from snapshots and observed views.

`Orchestration` coordinates occupancy IO, persistence, clocks, and process
execution. Lock freshness is a domain policy; file stores, pid checks, and
process runners are adapters. See RFC 0012 for the repository-wide rules.
