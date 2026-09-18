# Rivus Task Manager Plugin

`@rivus/agent-task-loop/rivus-plugin` turns Agent Task Loop into an external
Rivus Plugin. The Task Backend remains the system of record; the Plugin only
exposes a bounded application API for listing, reading, creating, and starting
tasks.

The CLI and Plugin are separate entrypoints in the same package:

```bash
npx @rivus/agent-task-loop --help
```

```ts
import plugin from '@rivus/agent-task-loop/rivus-plugin';
```

## Requirements

- Node.js 24 or a later version supported by the installed Rivus Core
- `@rivus/agent` in the supported peer range `>=0.1.1 <0.4.0`
- Agent Task Loop configured as described in the package README

Install and lock both Core and Plugin in the Deployment project:

```bash
npm install @rivus/agent@0.1.1 @rivus/agent-task-loop
```

`@rivus/agent` is an optional package peer so a CLI-only installation keeps the
CLI's Node.js 20 compatibility and does not install Rivus Core. A project that
imports the Plugin entrypoint must install a supported Core version explicitly.

## Deployment configuration

The Plugin registers the `task-manager` Profile. A Deployment must still state
the exact Tool allowlist; wildcard and ambient Tool discovery are not used.
The smallest read-only Deployment is:

```json
{
  "plugins": [
    {
      "id": "task-agent-package",
      "module": "@rivus/agent-task-loop/rivus-plugin",
      "required": true
    }
  ],
  "agents": [
    {
      "agentId": "task-reader",
      "endpointIds": [],
      "memory": { "scopes": [], "tool": false },
      "pluginId": "task-agent-package",
      "profileId": "task-manager",
      "skills": { "allow": [] },
      "tools": {
        "allow": [
          "agent-task-loop/task-list",
          "agent-task-loop/task-get"
        ]
      }
    }
  ],
  "defaultAgentId": "task-reader"
}
```

Grant the two mutation Tools only when that Agent Instance is meant to change
or execute tasks:

```json
{
  "tools": {
    "allow": [
      "agent-task-loop/task-list",
      "agent-task-loop/task-get",
      "agent-task-loop/task-create",
      "agent-task-loop/task-start"
    ]
  }
}
```

For a Feishu-connected Agent Instance, bind the Endpoint by ID on both sides of
the Host Deployment manifest:

```json
{
  "agents": [
    {
      "agentId": "task-reader",
      "endpointIds": ["task-manager-feishu"],
      "pluginId": "task-agent-package",
      "profileId": "task-manager",
      "skills": { "allow": [] },
      "tools": {
        "allow": [
          "agent-task-loop/task-list",
          "agent-task-loop/task-get"
        ]
      }
    }
  ],
  "endpoints": [
    {
      "id": "task-manager-feishu",
      "agentId": "task-reader",
      "sessionNamespace": "task-manager-feishu-v1",
      "credentialRef": "env:RIVUS_TASK_MANAGER_FEISHU",
      "enabled": true,
      "required": true,
      "baseUrl": "https://open.feishu.cn",
      "streamMinIntervalMs": 200,
      "groupPolicy": "mention-only"
    }
  ]
}
```

Endpoint credentials and outbound delivery targets belong to the Rivus Host
Deployment. Keep `credentialRef` values such as
`env:RIVUS_TASK_MANAGER_FEISHU` in Host endpoint configuration and keep target
references in Host delivery configuration. They are never Tool arguments and
the Plugin does not register an Automation or delivery target of its own.

The default Plugin composition reads the same Agent Task Loop JSON config as
the CLI, but only after a Tool executor is invoked. Importing or registering the
Plugin does not read config, access the network, start a timer, or create a task
runner. A code-level composition root can instead inject a bounded application
for tests or an embedded runtime:

```ts
import { createRivusTaskManagerPlugin } from '@rivus/agent-task-loop/rivus-plugin';

const plugin = createRivusTaskManagerPlugin({
  createTaskManager: async () => taskManagerApplication,
});
```

## Tool contracts

| Tool | Risk | Replay idempotency | Purpose |
| --- | --- | --- | --- |
| `agent-task-loop/task-list` | `observe` | `supported` | List at most 100 filtered tasks |
| `agent-task-loop/task-get` | `observe` | `supported` | Read one task by stable task ID |
| `agent-task-loop/task-create` | `mutate` | `none` | Create one backend-owned task |
| `agent-task-loop/task-start` | `mutate` | `none` | Start or recover execution and review |

All input schemas are strict and reject unknown properties. `task-create` and
`task-start` are deliberately non-replayable: the Host must require the normal
mutation approval and must not treat a crash as proof that the operation did
not happen.

## Public task data

Task query results are mapped to a stable allowlisted DTO. User-facing task
identity, status, ownership, bounded summaries, review/acceptance results, and
Pull Request links may be returned. These runtime and infrastructure fields are
never exposed:

- workspace or repository filesystem paths
- log paths or raw logs
- session, process, runner, run, or claim identifiers
- branch and commit internals
- raw provider responses, provider configuration, credentials, or stack traces

Backend failures are mapped to neutral operation errors. Invalid input and
missing task IDs are returned as bounded Tool input rejections. Raw backend
errors are not passed to the Agent.

## Package verification

From the monorepo root, build and run the clean-consumer check:

```bash
corepack pnpm@9.15.9 --filter @rivus/agent-task-loop build
corepack pnpm@9.15.9 --filter @rivus/agent-task-loop package:check
```

The check packs the package into temporary clean consumers. It first installs
and runs the CLI without Rivus Core, then installs the supported Rivus peer,
imports and validates the Plugin, and compiles a downstream TypeScript
consumer.
