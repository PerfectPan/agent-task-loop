///|
fn provider_specs() -> Array[ProviderSpec] {
  [
    cli(
      "opencode",
      "OpenCode",
      ["opencode"],
      ["~/.config/opencode"],
      [],
      ["~/.config/opencode/opencode.json"],
      [
        "Provider metadata is conservative until exact OpenCode install variants are verified.",
      ],
    ),
    app("openhands", "OpenHands", ["openhands"], ["~/.openhands"], [], [], [
      "OpenHands may be local, containerized, or remote; discovery is conservative.",
    ]),
    cli(
      "claude-code",
      "Claude Code",
      ["claude"],
      ["~/.claude", "~/.claude.json"],
      [],
      ["~/.claude.json", "~/.claude/settings.json"],
      [],
    ),
    extension("cline", "Cline", [], ["~/.vscode/extensions"], [], [], [
      "Cline extension presence is not validated without reading extension metadata.",
    ]),
    cli("codebuddy", "CodeBuddy", ["codebuddy"], ["~/.codebuddy"], [], [], [
      "CodeBuddy command and config paths may vary by distribution.",
    ]),
    cli(
      "codex",
      "Codex",
      ["codex"],
      ["~/.codex"],
      [],
      ["~/.codex/config.toml"],
      [],
    ),
    cli(
      "command-code",
      "Command Code",
      ["command-code"],
      ["~/.command-code"],
      [],
      [],
      ["Command Code provider metadata needs validation."],
    ),
    cli("kiro-cli", "Kiro CLI", ["kiro"], ["~/.kiro"], [], [], [
      "Kiro CLI provider metadata needs validation.",
    ]),
    app(
      "cursor",
      "Cursor",
      ["cursor"],
      [
        "~/Library/Application Support/Cursor/User", "~/.config/Cursor/User", "~/AppData/Roaming/Cursor/User",
      ],
      ["/Applications/Cursor.app"],
      [
        "~/.cursor/mcp.json", "~/Library/Application Support/Cursor/User/mcp.json",
      ],
      [],
    ),
    app(
      "antigravity",
      "Antigravity",
      ["antigravity"],
      ["~/.antigravity"],
      [],
      [],
      ["Antigravity provider metadata needs validation."],
    ),
    extension("roo-code", "Roo Code", [], ["~/.vscode/extensions"], [], [], [
      "Roo Code extension presence is not validated without reading extension metadata.",
    ]),
    cli(
      "github-copilot",
      "GitHub Copilot",
      ["gh", "copilot"],
      ["~/.config/gh"],
      [],
      [],
      [
        "GitHub Copilot CLI support is detected conservatively through command metadata.",
      ],
    ),
    cli("amp", "Amp", ["amp"], ["~/.amp"], [], [], [
      "Amp provider metadata needs validation.",
    ]),
    cli("openclaw", "OpenClaw", ["openclaw"], ["~/.openclaw"], [], [], [
      "OpenClaw provider metadata needs validation.",
    ]),
    cli("neovate", "Neovate", ["neovate"], ["~/.neovate"], [], [], [
      "Neovate provider metadata needs validation.",
    ]),
    cli("pi", "Pi", ["pi"], ["~/.pi"], [], [], [
      "Pi provider metadata needs validation.",
    ]),
    cli("qoder", "Qoder", ["qoder"], ["~/.qoder"], [], [], [
      "Qoder provider metadata needs validation.",
    ]),
    cli("zencoder", "Zencoder", ["zencoder"], ["~/.zencoder"], [], [], [
      "Zencoder provider metadata needs validation.",
    ]),
    cli("kimi-code-cli", "Kimi Code CLI", ["kimi"], ["~/.kimi"], [], [], [
      "Kimi Code CLI provider metadata needs validation.",
    ]),
    cli(
      "gemini-cli",
      "Gemini CLI",
      ["gemini"],
      ["~/.gemini"],
      [],
      ["~/.gemini/settings.json"],
      [],
    ),
    app(
      "windsurf",
      "Windsurf",
      ["windsurf"],
      [
        "~/Library/Application Support/Windsurf/User", "~/.config/Windsurf/User",
        "~/.codeium",
      ],
      ["/Applications/Windsurf.app"],
      [
        "~/.codeium/windsurf/mcp_config.json", "~/Library/Application Support/Windsurf/User/mcp.json",
      ],
      [],
    ),
    extension(
      "vscode-copilot",
      "VS Code Copilot",
      ["code"],
      [
        "~/Library/Application Support/Code/User", "~/.config/Code/User", "~/AppData/Roaming/Code/User",
      ],
      [],
      ["~/Library/Application Support/Code/User/mcp.json"],
      [
        "VS Code Copilot extension presence is not validated without reading extension metadata.",
      ],
    ),
    app(
      "codex-desktop",
      "Codex Desktop",
      [],
      ["~/.codex"],
      ["/Applications/Codex.app"],
      ["~/.codex/config.toml"],
      [],
    ),
    cli(
      "aider",
      "aider",
      ["aider"],
      ["~/.aider.conf.yml", "~/.config/aider"],
      [],
      [],
      [],
    ),
    cli("hermes", "Hermes", ["hermes"], ["~/.hermes"], [], [], [
      "Hermes provider metadata needs validation.",
    ]),
    cli("trae", "Trae", ["trae"], ["~/.trae"], [], [], [
      "Trae provider metadata needs validation.",
    ]),
  ]
}

///|
fn cli(
  id : String,
  display_name : String,
  commands : Array[String],
  config_paths : Array[String],
  app_paths : Array[String],
  mcp_paths : Array[String],
  warnings : Array[String],
) -> ProviderSpec {
  ProviderSpec::{
    id,
    display_name,
    kind: "cli",
    adapter_mode: "versioned-cli",
    command_candidates: commands,
    app_path_candidates: app_paths,
    config_path_candidates: config_paths,
    mcp_config_path_candidates: mcp_paths,
    version_probe: Some("--version"),
    warnings,
  }
}

///|
fn app(
  id : String,
  display_name : String,
  commands : Array[String],
  config_paths : Array[String],
  app_paths : Array[String],
  mcp_paths : Array[String],
  warnings : Array[String],
) -> ProviderSpec {
  ProviderSpec::{
    id,
    display_name,
    kind: "app",
    adapter_mode: "app-only",
    command_candidates: commands,
    app_path_candidates: app_paths,
    config_path_candidates: config_paths,
    mcp_config_path_candidates: mcp_paths,
    version_probe: None,
    warnings,
  }
}

///|
fn extension(
  id : String,
  display_name : String,
  commands : Array[String],
  config_paths : Array[String],
  app_paths : Array[String],
  mcp_paths : Array[String],
  warnings : Array[String],
) -> ProviderSpec {
  ProviderSpec::{
    id,
    display_name,
    kind: "extension",
    adapter_mode: "extension",
    command_candidates: commands,
    app_path_candidates: app_paths,
    config_path_candidates: config_paths,
    mcp_config_path_candidates: mcp_paths,
    version_probe: None,
    warnings,
  }
}
