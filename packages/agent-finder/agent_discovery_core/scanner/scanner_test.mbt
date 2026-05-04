///|
test "scan derives runnable status with evidence and json nulls" {
  let probe = @model.Probe::{
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
  let probe = @model.Probe::{
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
