---
"@rivus/agent-finder-core": patch
"@rivus/agent-finder-cli": patch
"@rivus/agent-task-loop": patch
---

Replace tsup with rslib for all packages. Eliminate scripts/sync-moonbit-js.mjs by embedding MoonBit FFI sync into an rslib plugin. Add shared @rivus/rslib-config package.
