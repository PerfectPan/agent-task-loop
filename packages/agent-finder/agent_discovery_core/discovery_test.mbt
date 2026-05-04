///|
fn expected_provider_ids() -> Array[String] {
  [
    "opencode", "openhands", "claude-code", "cline", "codebuddy", "codex", "command-code",
    "kiro-cli", "cursor", "antigravity", "roo-code", "github-copilot", "amp", "openclaw",
    "neovate", "pi", "qoder", "zencoder", "kimi-code-cli", "gemini-cli", "windsurf",
    "vscode-copilot", "codex-desktop", "aider", "hermes", "trae",
  ]
}

///|

///|
test "provider specs cover accepted support matrix in stable order" {
  let ids = known_provider_specs().map(fn(spec) { spec.id })
  assert_eq(ids, expected_provider_ids())
}

///|
test "provider specs validate adapter modes and duplicate ids" {
  let duplicate = ProviderSpec::{
    id: "codex",
    display_name: "Codex copy",
    kind: "cli",
    adapter_mode: "metadata",
    command_candidates: [],
    app_path_candidates: [],
    config_path_candidates: [],
    mcp_config_path_candidates: [],
    version_probe: None,
    warnings: [],
  }
  let invalid_mode = ProviderSpec::{
    id: "bad-provider",
    display_name: "Bad Provider",
    kind: "cli",
    adapter_mode: "custom-shell",
    command_candidates: [],
    app_path_candidates: [],
    config_path_candidates: [],
    mcp_config_path_candidates: [],
    version_probe: None,
    warnings: [],
  }
  inspect(validate_provider_specs(known_provider_specs()), content="[]")
  inspect(
    validate_provider_specs([known_provider_specs()[5], duplicate, invalid_mode]),
    content=(
      #|["duplicate provider id: codex", "unsupported adapter mode for bad-provider: custom-shell"]
    ),
  )
}

///|
test "scan derives runnable status with evidence and json nulls" {
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
  let codex = report.agents[5]
  assert_eq(report.schema_version, "0.1")
  assert_eq(report.host.os, "darwin")
  assert_eq(codex.id, "codex")
  assert_eq(codex.status, "runnable")
  match codex.command {
    Some(text) => assert_eq(text, "/opt/homebrew/bin/codex")
    None => assert_true(false)
  }
  match codex.version {
    Some(text) => assert_eq(text, "codex 0.1.0")
    None => assert_true(false)
  }
  assert_eq(codex.evidence[0].kind, "command")
  assert_eq(codex.evidence[0].exists, true)
  assert_eq(codex.evidence[1].kind, "version")
  assert_eq(codex.evidence[1].exists, true)
  let json = to_json_string(report)
  assert_true(json.contains("\"schema_version\": \"0.1\""))
  assert_true(json.contains("\"evidence\""))
  assert_true(json.contains("\"app_path\": null"))
}

///|
test "scan uses platform fixtures without touching host" {
  let probe = Probe::{
    os: "win32",
    arch: "x64",
    home: "C:\\Users\\tester",
    generated_at: "2026-05-03T00:00:00Z",
    commands: { "code": "C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd" },
    executable_paths: {
      "C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd": true,
    },
    existing_paths: {},
    versions: {},
  }
  let vscode = scan(probe).agents[21]
  assert_eq(vscode.id, "vscode-copilot")
  assert_eq(vscode.status, "found")
  match vscode.command {
    Some(text) =>
      assert_eq(text, "C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd")
    None => assert_true(false)
  }
  assert_eq(vscode.evidence[0].reason, "command resolved on PATH")
}

///|
test "doctor aggregates statuses and warnings" {
  let probe = Probe::{
    os: "linux",
    arch: "x64",
    home: "/home/tester",
    generated_at: "2026-05-03T00:00:00Z",
    commands: {},
    executable_paths: {},
    existing_paths: { "/home/tester/.config/opencode": true },
    versions: {},
  }
  let summary = doctor(scan(probe))
  assert_eq(summary.total, 26)
  assert_eq(summary.found, 1)
  assert_eq(summary.runnable, 0)
  assert_eq(summary.missing, 25)
  assert_true(summary.warnings.length() > 0)
}
