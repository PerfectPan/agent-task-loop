---
"@rivus/agent-task-loop": minor
---

Provider-unaware run-time state store (RFC 0006). The loop's run-time state — session ids, runner pid/heartbeat, workspace path, review/acceptance rounds, publish result, claim info — is now persisted in a local store (`~/.agent-task-loop/state/<source>/<recordId>.json`) by a `StatefulTaskProvider` decorator that wraps the provider tree. Writes mirror the run-time subset locally then delegate unchanged; reads overlay it (local authoritative for the subset, backend as fallback). Feishu writes are untouched (still authoritative, still in the Base); GitHub — and any future low-fidelity source — keeps `resume`/`watch`/TUI session preview working instead of losing run-time state. The providers never see the store. Writes are atomic and best-effort; `cleanup` clears per-task state.
