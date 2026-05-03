test "scan reports runnable command with stable json fields" {
  let probe = Probe::{
    os: "darwin",
    arch: "arm64",
    home: "/tmp/agent-finder-home",
    generated_at: "2026-05-03T00:00:00+08:00",
    commands: { "codex": "/opt/homebrew/bin/codex" },
    executable_paths: { "/opt/homebrew/bin/codex": true },
    existing_paths: {
      "/tmp/agent-finder-home/.codex": true,
      "/tmp/agent-finder-home/.codex/config.toml": true,
    },
    versions: { "/opt/homebrew/bin/codex --version": "codex 0.1.0" },
  }
  let report = scan(probe)
  assert_eq(report.schema_version, "0.1")
  assert_eq(report.host.os, "darwin")
  let codex = report.agents[0]
  assert_eq(codex.id, "codex")
  assert_eq(codex.status, "runnable")
  assert_eq(codex.command, Some("/opt/homebrew/bin/codex"))
  assert_eq(codex.app_path, None)
  assert_eq(codex.version, Some("codex 0.1.0"))
  assert_eq(codex.config_paths, ["~/.codex"])
  assert_eq(codex.mcp_config_paths, ["~/.codex/config.toml"])
  inspect(
    to_json_string(report),
    content=(
      #|{
      #|  "schema_version": "0.1",
      #|  "generated_at": "2026-05-03T00:00:00+08:00",
      #|  "host": {
      #|    "os": "darwin",
      #|    "arch": "arm64"
      #|  },
      #|  "agents": [
      #|    {
      #|      "id": "codex",
      #|      "name": "Codex",
      #|      "type": "cli",
      #|      "status": "runnable",
      #|      "command": "/opt/homebrew/bin/codex",
      #|      "app_path": null,
      #|      "version": "codex 0.1.0",
      #|      "config_paths": [
      #|        "~/.codex"
      #|      ],
      #|      "mcp_config_paths": [
      #|        "~/.codex/config.toml"
      #|      ],
      #|      "warnings": []
      #|    },
      #|    {
      #|      "id": "claude-code",
      #|      "name": "Claude Code",
      #|      "type": "cli",
      #|      "status": "missing",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/.claude",
      #|        "~/.claude.json"
      #|      ],
      #|      "mcp_config_paths": [
      #|        "~/.claude.json",
      #|        "~/.claude/settings.json"
      #|      ],
      #|      "warnings": []
      #|    },
      #|    {
      #|      "id": "gemini-cli",
      #|      "name": "Gemini CLI",
      #|      "type": "cli",
      #|      "status": "missing",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/.gemini"
      #|      ],
      #|      "mcp_config_paths": [
      #|        "~/.gemini/settings.json"
      #|      ],
      #|      "warnings": []
      #|    },
      #|    {
      #|      "id": "opencode",
      #|      "name": "opencode",
      #|      "type": "cli",
      #|      "status": "missing",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/.config/opencode"
      #|      ],
      #|      "mcp_config_paths": [
      #|        "~/.config/opencode/opencode.json"
      #|      ],
      #|      "warnings": []
      #|    },
      #|    {
      #|      "id": "aider",
      #|      "name": "aider",
      #|      "type": "cli",
      #|      "status": "missing",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/.aider.conf.yml",
      #|        "~/.config/aider"
      #|      ],
      #|      "mcp_config_paths": [],
      #|      "warnings": []
      #|    },
      #|    {
      #|      "id": "github-copilot-cli",
      #|      "name": "GitHub Copilot CLI",
      #|      "type": "cli",
      #|      "status": "missing",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/.config/gh"
      #|      ],
      #|      "mcp_config_paths": [],
      #|      "warnings": [
      #|        "GitHub Copilot CLI is detected through gh extension support when gh is present."
      #|      ]
      #|    },
      #|    {
      #|      "id": "cursor",
      #|      "name": "Cursor",
      #|      "type": "editor",
      #|      "status": "missing",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/Library/Application Support/Cursor/User"
      #|      ],
      #|      "mcp_config_paths": [
      #|        "~/.cursor/mcp.json",
      #|        "~/Library/Application Support/Cursor/User/mcp.json"
      #|      ],
      #|      "warnings": []
      #|    },
      #|    {
      #|      "id": "windsurf",
      #|      "name": "Windsurf",
      #|      "type": "editor",
      #|      "status": "missing",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/Library/Application Support/Windsurf/User",
      #|        "~/.codeium"
      #|      ],
      #|      "mcp_config_paths": [
      #|        "~/.codeium/windsurf/mcp_config.json",
      #|        "~/Library/Application Support/Windsurf/User/mcp.json"
      #|      ],
      #|      "warnings": []
      #|    },
      #|    {
      #|      "id": "vscode-copilot",
      #|      "name": "VS Code Copilot",
      #|      "type": "editor",
      #|      "status": "missing",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/Library/Application Support/Code/User"
      #|      ],
      #|      "mcp_config_paths": [
      #|        "~/Library/Application Support/Code/User/mcp.json"
      #|      ],
      #|      "warnings": [
      #|        "VS Code Copilot extension presence is not validated without reading extension metadata."
      #|      ]
      #|    },
      #|    {
      #|      "id": "codex-desktop",
      #|      "name": "Codex Desktop",
      #|      "type": "desktop",
      #|      "status": "found",
      #|      "command": null,
      #|      "app_path": null,
      #|      "version": null,
      #|      "config_paths": [
      #|        "~/.codex"
      #|      ],
      #|      "mcp_config_paths": [
      #|        "~/.codex/config.toml"
      #|      ],
      #|      "warnings": []
      #|    }
      #|  ]
      #|}
    ),
  )
}

test "scan reports found desktop app without running it" {
  let probe = Probe::{
    os: "darwin",
    arch: "arm64",
    home: "/tmp/agent-finder-home",
    generated_at: "2026-05-03T00:00:00+08:00",
    commands: {},
    executable_paths: {},
    existing_paths: { "/Applications/Cursor.app": true },
    versions: {},
  }
  let cursor = scan(probe).agents[6]
  assert_eq(cursor.id, "cursor")
  assert_eq(cursor.status, "found")
  assert_eq(cursor.command, None)
  assert_eq(cursor.app_path, Some("/Applications/Cursor.app"))
  assert_eq(cursor.version, None)
}

test "diagnostics summarize runnable found and missing agents" {
  let probe = Probe::{
    os: "darwin",
    arch: "arm64",
    home: "/tmp/agent-finder-home",
    generated_at: "2026-05-03T00:00:00+08:00",
    commands: { "codex": "/usr/local/bin/codex" },
    executable_paths: { "/usr/local/bin/codex": true },
    existing_paths: { "/Applications/Windsurf.app": true },
    versions: {},
  }
  let summary = doctor(scan(probe))
  assert_eq(summary.total, 10)
  assert_eq(summary.runnable, 1)
  assert_eq(summary.found, 1)
  assert_eq(summary.missing, 8)
  assert_true(summary.warnings.length() >= 2)
}
