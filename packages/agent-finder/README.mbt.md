# Agent Finder

`agent-finder` is a local code agent inventory provider for Agent Task Loop.
It only discovers installed agents and reports diagnostics. It does not schedule
work, run agent tasks, take over terminals, proxy API requests, read token
contents, or upload data.

## Packages

- `agent_discovery_core`: stable models and scanner logic.
- `agent_finder_cli`: command-line entry point and output formatting.

## Commands

```bash
node packages/agent-finder/bin/agent-finder.mjs scan
node packages/agent-finder/bin/agent-finder.mjs scan --json
node packages/agent-finder/bin/agent-finder.mjs doctor
```

The stable JSON schema is versioned with `schema_version`.
