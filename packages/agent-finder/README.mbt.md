# agent-finder

Read-only local code agent discovery for Agent Task Loop and JavaScript consumers.

This package is the MoonBit provider core for RFC 0002. It models supported coding-agent providers, evaluates host probe facts, derives stable discovery statuses, records evidence for each status, and emits JSON with `schema_version: "0.1"`.

## Boundary

The core does not touch the host. Callers provide a `Probe` containing command, path, executable, and version facts. The scanner does not execute tasks, start agent sessions, submit prompts, upload inventory data, parse tokens, or read config file contents.

## Publishing

The MoonBit module metadata lives in `moon.mod.json`. Publishing to mooncakes.io is manual until release ownership and credentials are explicitly confirmed.

Manual publish outline:

```bash
moon register
moon login
moon publish
```

Published updates should use SemVer version bumps.
