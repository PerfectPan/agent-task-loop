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
test "provider specs cover accepted support matrix in stable order" {
  let ids = known_provider_specs().map(fn(spec) { spec.id })
  assert_eq(ids, expected_provider_ids())
}

///|
test "provider specs validate adapter modes and duplicate ids" {
  let duplicate = @model.ProviderSpec::{
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
  let invalid_mode = @model.ProviderSpec::{
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
  let errors = validate_provider_specs([known_provider_specs()[5], duplicate, invalid_mode])
  assert_eq(errors.length(), 2)
  assert_eq(errors[0], "duplicate provider id: codex")
  assert_eq(errors[1], "unsupported adapter mode for bad-provider: custom-shell")
}
