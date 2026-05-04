///|
pub(all) struct HostInfo {
  os : String
  arch : String
} derive(ToJson, Debug, Eq)

///|
pub(all) struct Evidence {
  kind : String
  value : String
  exists : Bool
  reason : String
} derive(ToJson, Debug, Eq)

///|
pub(all) struct Probe {
  os : String
  arch : String
  home : String
  generated_at : String
  commands : Map[String, String]
  executable_paths : Map[String, Bool]
  existing_paths : Map[String, Bool]
  versions : Map[String, String]
}

///|
pub(all) struct ProviderSpec {
  id : String
  display_name : String
  kind : String
  adapter_mode : String
  command_candidates : Array[String]
  app_path_candidates : Array[String]
  config_path_candidates : Array[String]
  mcp_config_path_candidates : Array[String]
  version_probe : String?
  warnings : Array[String]
} derive(Debug, Eq)

///|
pub impl ToJson for AgentRecord with to_json(self) -> Json {
  {
    "id": self.id,
    "name": self.name,
    "type": self.type_,
    "status": self.status,
    "command": option_string_to_json(self.command),
    "app_path": option_string_to_json(self.app_path),
    "version": option_string_to_json(self.version),
    "evidence": self.evidence,
    "config_paths": self.config_paths,
    "mcp_config_paths": self.mcp_config_paths,
    "warnings": self.warnings,
  }
}

///|
fn option_string_to_json(value : String?) -> Json {
  match value {
    Some(text) => Json::string(text)
    None => Json::null()
  }
}

///|
pub(all) struct AgentRecord {
  id : String
  name : String
  type_ : String
  status : String
  command : String?
  app_path : String?
  version : String?
  evidence : Array[Evidence]
  config_paths : Array[String]
  mcp_config_paths : Array[String]
  warnings : Array[String]
} derive(Debug, Eq)

///|
pub(all) struct DiscoveryReport {
  schema_version : String
  generated_at : String
  host : HostInfo
  agents : Array[AgentRecord]
} derive(ToJson, Debug, Eq)

///|
pub(all) struct DoctorSummary {
  total : Int
  runnable : Int
  found : Int
  missing : Int
  unknown : Int
  warnings : Array[String]
} derive(ToJson, Debug, Eq)

///|
pub fn known_provider_specs() -> Array[ProviderSpec] {
  provider_specs()
}

///|
pub fn scan(probe : Probe) -> DiscoveryReport {
  let agents = Array::new()
  for spec in provider_specs() {
    agents.push(scan_provider(spec, probe))
  }
  DiscoveryReport::{
    schema_version: "0.1",
    generated_at: probe.generated_at,
    host: HostInfo::{ os: probe.os, arch: probe.arch },
    agents,
  }
}

///|
pub fn doctor(report : DiscoveryReport) -> DoctorSummary {
  let mut runnable = 0
  let mut found = 0
  let mut missing = 0
  let mut unknown = 0
  let warnings = Array::new()
  for agent in report.agents {
    match agent.status {
      "runnable" => runnable += 1
      "found" => found += 1
      "missing" => missing += 1
      _ => unknown += 1
    }
    for warning in agent.warnings {
      warnings.push(agent.id + ": " + warning)
    }
  }
  DoctorSummary::{
    total: report.agents.length(),
    runnable,
    found,
    missing,
    unknown,
    warnings,
  }
}

///|
pub fn to_json_string(report : DiscoveryReport) -> String {
  report.to_json().stringify(indent=2)
}

///|
pub fn validate_provider_specs(_specs : Array[ProviderSpec]) -> Array[String] {
  let errors = Array::new()
  let seen = Array::new()
  for spec in _specs {
    if seen.contains(spec.id) {
      errors.push("duplicate provider id: " + spec.id)
    } else {
      seen.push(spec.id)
    }
    if !is_supported_adapter_mode(spec.adapter_mode) {
      errors.push(
        "unsupported adapter mode for " + spec.id + ": " + spec.adapter_mode,
      )
    }
  }
  errors
}

///|
pub fn known_command_candidates() -> Array[String] {
  let commands = Array::new()
  for spec in provider_specs() {
    for command in spec.command_candidates {
      if !commands.contains(command) {
        commands.push(command)
      }
    }
  }
  commands
}

///|
pub fn known_path_candidates() -> Array[String] {
  let paths = Array::new()
  for spec in provider_specs() {
    for path in spec.app_path_candidates {
      push_unique(paths, path)
    }
    for path in spec.config_path_candidates {
      push_unique(paths, path)
    }
    for path in spec.mcp_config_path_candidates {
      push_unique(paths, path)
    }
  }
  paths
}

///|
fn scan_provider(spec : ProviderSpec, probe : Probe) -> AgentRecord {
  let evidence = Array::new()
  let command = first_command(spec.command_candidates, probe.commands)
  let app_path = first_existing_path(spec.app_path_candidates, probe)
  let version = match command {
    Some(path) => {
      evidence.push(Evidence::{
        kind: "command",
        value: path,
        exists: true,
        reason: "command resolved on PATH",
      })
      match spec.version_probe {
        Some(arg) =>
          if is_executable(path, probe) {
            match version_for(path, arg, probe) {
              Some(text) => {
                evidence.push(Evidence::{
                  kind: "version",
                  value: path + " " + arg,
                  exists: true,
                  reason: "version probe exited successfully",
                })
                Some(text)
              }
              None => None
            }
          } else {
            None
          }
        None => None
      }
    }
    None => None
  }
  match app_path {
    Some(path) =>
      evidence.push(Evidence::{
        kind: "app_path",
        value: path,
        exists: true,
        reason: "app path exists",
      })
    None => ()
  }
  let has_config = push_path_evidence(
    evidence,
    "config",
    spec.config_path_candidates,
    probe,
    "config path exists",
  )
  let has_mcp_config = push_path_evidence(
    evidence,
    "mcp_config",
    spec.mcp_config_path_candidates,
    probe,
    "MCP config path exists",
  )
  let status = derive_status(
    spec, command, app_path, version, has_config, has_mcp_config, probe,
  )
  AgentRecord::{
    id: spec.id,
    name: spec.display_name,
    type_: spec.kind,
    status,
    command,
    app_path,
    version,
    evidence,
    config_paths: spec.config_path_candidates,
    mcp_config_paths: spec.mcp_config_path_candidates,
    warnings: spec.warnings,
  }
}

///|
fn derive_status(
  spec : ProviderSpec,
  command : String?,
  app_path : String?,
  version : String?,
  has_config : Bool,
  has_mcp_config : Bool,
  probe : Probe,
) -> String {
  match spec.adapter_mode {
    "versioned-cli" =>
      match command {
        Some(path) =>
          if is_executable(path, probe) && version != None {
            "runnable"
          } else {
            "found"
          }
        None =>
          if app_path != None || has_config || has_mcp_config {
            "found"
          } else {
            "missing"
          }
      }
    "metadata" =>
      match command {
        Some(path) =>
          if is_executable(path, probe) {
            "runnable"
          } else {
            "found"
          }
        None =>
          if app_path != None || has_config || has_mcp_config {
            "found"
          } else {
            "missing"
          }
      }
    _ =>
      if command != None || app_path != None || has_config || has_mcp_config {
        "found"
      } else {
        "missing"
      }
  }
}

///|
fn first_command(
  candidates : Array[String],
  commands : Map[String, String],
) -> String? {
  for command in candidates {
    match commands.get(command) {
      Some(path) => return Some(path)
      None => ()
    }
  }
  None
}

///|
fn first_existing_path(paths : Array[String], probe : Probe) -> String? {
  for path in paths {
    if path_exists(path, probe) {
      return Some(expand_path(path, probe.home))
    }
  }
  None
}

///|
fn push_path_evidence(
  evidence : Array[Evidence],
  kind : String,
  paths : Array[String],
  probe : Probe,
  reason : String,
) -> Bool {
  let mut found = false
  for path in paths {
    if path_exists(path, probe) {
      found = true
      evidence.push(Evidence::{
        kind,
        value: expand_path(path, probe.home),
        exists: true,
        reason,
      })
    }
  }
  found
}

///|
fn path_exists(path : String, probe : Probe) -> Bool {
  match probe.existing_paths.get(expand_path(path, probe.home)) {
    Some(true) => true
    _ => false
  }
}

///|
fn is_executable(path : String, probe : Probe) -> Bool {
  match probe.executable_paths.get(path) {
    Some(true) => true
    _ => false
  }
}

///|
fn version_for(path : String, version_arg : String, probe : Probe) -> String? {
  probe.versions.get(path + " " + version_arg)
}

///|
pub fn expand_path(path : String, home : String) -> String {
  if path == "~" {
    home
  } else if path.has_prefix("~/"[:]) {
    home + path.unsafe_substring(start=1, end=path.length())
  } else {
    path
  }
}

///|
fn is_supported_adapter_mode(mode : String) -> Bool {
  mode == "metadata" ||
  mode == "versioned-cli" ||
  mode == "app-only" ||
  mode == "extension"
}

///|
fn push_unique(items : Array[String], item : String) -> Unit {
  if !items.contains(item) {
    items.push(item)
  }
}

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
