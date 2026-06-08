---
"@rivus/agent-task-loop": minor
---

feat(task): integration-layer multi-source task backends

Position the tool as an integration layer over your existing trackers rather
than a system of record. Each task's source of truth stays its own backend;
the CLI and TUI read from many and route writes back to the owning source.

- Every `TaskRecord`/`TaskRef` carries a `source`; a `SourceProvider` interface
  declares each leaf backend's id. Feishu Base reports `source: 'feishu'`.
- `CompositeTaskProvider` reads/merges from all configured sources and routes
  writes (and creates) back to the backend that owns each task, with a default
  source for unrouted creates. No global store, no cross-source sync.
- New `GitHubIssuesTaskProvider`: read + create tasks backed by GitHub Issues
  (task-id marker, `agent:`/`P{n}` labels, PRs skipped), with lifecycle changes
  synced back as issue comments / close. Enabled via an optional `githubIssues`
  config block (`owner`/`repo`/`token`/`defaultAgent`).
- TUI multi-source affordances: a per-row source tag and a `来源` detail field
  for secondary backends, plus a capability-aware Source selector in the create
  form (shown only when more than one create-capable source is configured).
