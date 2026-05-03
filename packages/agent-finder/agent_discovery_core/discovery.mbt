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

pub(all) struct HostInfo {
  os : String
  arch : String
} derive(ToJson, Show, Eq)

pub(all) struct AgentRecord {
  id : String
  name : String
  type_ : String
  status : String
  command : String?
  app_path : String?
  version : String?
  config_paths : Array[String]
  mcp_config_paths : Array[String]
  warnings : Array[String]
} derive(Show, Eq)

pub impl ToJson for AgentRecord with to_json(self) -> Json {
  {
    "id": self.id,
    "name": self.name,
    "type": self.type_,
    "status": self.status,
    "command": option_string_to_json(self.command),
    "app_path": option_string_to_json(self.app_path),
    "version": option_string_to_json(self.version),
    "config_paths": self.config_paths,
    "mcp_config_paths": self.mcp_config_paths,
    "warnings": self.warnings,
  }
}

pub(all) struct DiscoveryReport {
  schema_version : String
  generated_at : String
  host : HostInfo
  agents : Array[AgentRecord]
} derive(ToJson, Show, Eq)

pub(all) struct DoctorSummary {
  total : Int
  runnable : Int
  found : Int
  missing : Int
  unknown : Int
  warnings : Array[String]
} derive(ToJson, Show, Eq)

priv struct AgentSpec {
  id : String
  name : String
  type_ : String
  command_candidates : Array[String]
  version_arg : String
  app_paths : Array[String]
  config_paths : Array[String]
  mcp_config_paths : Array[String]
  warnings : Array[String]
  requires_version_for_runnable : Bool
}

fn option_string_to_json(value : String?) -> Json {
  match value {
    Some(text) => Json::string(text)
    None => Json::null()
  }
}

pub fn scan(probe : Probe) -> DiscoveryReport {
  let records = Array::new()
  for spec in agent_specs() {
    records.push(scan_agent(spec, probe))
  }
  DiscoveryReport::{
    schema_version: "0.1",
    generated_at: probe.generated_at,
    host: HostInfo::{ os: probe.os, arch: probe.arch },
    agents: records,
  }
}

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

pub fn to_json_string(report : DiscoveryReport) -> String {
  report.to_json().stringify(indent=2)
}

pub fn known_command_candidates() -> Array[String] {
  let commands = Array::new()
  for spec in agent_specs() {
    for command in spec.command_candidates {
      if not(commands.contains(command)) {
        commands.push(command)
      }
    }
  }
  commands
}

pub fn known_path_candidates() -> Array[String] {
  let paths = Array::new()
  for spec in agent_specs() {
    for path in spec.app_paths {
      if not(paths.contains(path)) {
        paths.push(path)
      }
    }
    for path in spec.config_paths {
      if not(paths.contains(path)) {
        paths.push(path)
      }
    }
    for path in spec.mcp_config_paths {
      if not(paths.contains(path)) {
        paths.push(path)
      }
    }
  }
  paths
}

fn scan_agent(spec : AgentSpec, probe : Probe) -> AgentRecord {
  let command = first_command(spec.command_candidates, probe.commands)
  let app = first_existing_path(spec.app_paths, probe)
  let has_config = any_existing_path(spec.config_paths, probe)
  let has_mcp_config = any_existing_path(spec.mcp_config_paths, probe)
  let version = match command {
    Some(path) =>
      if is_executable(path, probe) {
        version_for(path, spec.version_arg, probe)
      } else {
        None
      }
    None => None
  }
  let status = match command {
    Some(path) =>
      if is_executable(path, probe) &&
        (not(spec.requires_version_for_runnable) || version != None) {
        "runnable"
      } else {
        "found"
      }
    None =>
      match app {
        Some(_) => "found"
        None =>
          if has_config || has_mcp_config {
            "found"
          } else {
            "missing"
          }
      }
  }
  AgentRecord::{
    id: spec.id,
    name: spec.name,
    type_: spec.type_,
    status,
    command,
    app_path: app,
    version,
    config_paths: spec.config_paths,
    mcp_config_paths: spec.mcp_config_paths,
    warnings: spec.warnings,
  }
}

fn first_command(candidates : Array[String], commands : Map[String, String]) -> String? {
  for command in candidates {
    match commands.get(command) {
      Some(path) => return Some(path)
      None => ()
    }
  }
  None
}

fn first_existing_path(paths : Array[String], probe : Probe) -> String? {
  for path in paths {
    if path_exists(path, probe) {
      return Some(expand_path(path, probe.home))
    }
  }
  None
}

fn any_existing_path(paths : Array[String], probe : Probe) -> Bool {
  for path in paths {
    if path_exists(path, probe) {
      return true
    }
  }
  false
}

fn path_exists(path : String, probe : Probe) -> Bool {
  match probe.existing_paths.get(expand_path(path, probe.home)) {
    Some(true) => true
    _ => false
  }
}

fn is_executable(path : String, probe : Probe) -> Bool {
  match probe.executable_paths.get(path) {
    Some(true) => true
    _ => false
  }
}

fn version_for(path : String, version_arg : String, probe : Probe) -> String? {
  let key = if version_arg.is_empty() { path } else { path + " " + version_arg }
  probe.versions.get(key)
}

pub fn expand_path(path : String, home : String) -> String {
  if path == "~" {
    home
  } else if path.has_prefix("~/"[:]) {
    home + path.unsafe_substring(start=1, end=path.length())
  } else {
    path
  }
}

fn agent_specs() -> Array[AgentSpec] {
  [
    AgentSpec::{
      id: "codex",
      name: "Codex",
      type_: "cli",
      command_candidates: ["codex"],
      version_arg: "--version",
      app_paths: [],
      config_paths: ["~/.codex"],
      mcp_config_paths: ["~/.codex/config.toml"],
      warnings: [],
      requires_version_for_runnable: false,
    },
    AgentSpec::{
      id: "claude-code",
      name: "Claude Code",
      type_: "cli",
      command_candidates: ["claude"],
      version_arg: "--version",
      app_paths: [],
      config_paths: ["~/.claude", "~/.claude.json"],
      mcp_config_paths: ["~/.claude.json", "~/.claude/settings.json"],
      warnings: [],
      requires_version_for_runnable: false,
    },
    AgentSpec::{
      id: "gemini-cli",
      name: "Gemini CLI",
      type_: "cli",
      command_candidates: ["gemini"],
      version_arg: "--version",
      app_paths: [],
      config_paths: ["~/.gemini"],
      mcp_config_paths: ["~/.gemini/settings.json"],
      warnings: [],
      requires_version_for_runnable: false,
    },
    AgentSpec::{
      id: "opencode",
      name: "opencode",
      type_: "cli",
      command_candidates: ["opencode"],
      version_arg: "--version",
      app_paths: [],
      config_paths: ["~/.config/opencode"],
      mcp_config_paths: ["~/.config/opencode/opencode.json"],
      warnings: [],
      requires_version_for_runnable: false,
    },
    AgentSpec::{
      id: "aider",
      name: "aider",
      type_: "cli",
      command_candidates: ["aider"],
      version_arg: "--version",
      app_paths: [],
      config_paths: ["~/.aider.conf.yml", "~/.config/aider"],
      mcp_config_paths: [],
      warnings: [],
      requires_version_for_runnable: false,
    },
    AgentSpec::{
      id: "github-copilot-cli",
      name: "GitHub Copilot CLI",
      type_: "cli",
      command_candidates: ["github-copilot-cli", "gh"],
      version_arg: "copilot --version",
      app_paths: [],
      config_paths: ["~/.config/gh"],
      mcp_config_paths: [],
      warnings: [
        "GitHub Copilot CLI is detected through gh extension support when gh is present.",
      ],
      requires_version_for_runnable: true,
    },
    AgentSpec::{
      id: "cursor",
      name: "Cursor",
      type_: "editor",
      command_candidates: ["cursor"],
      version_arg: "--version",
      app_paths: ["/Applications/Cursor.app"],
      config_paths: ["~/Library/Application Support/Cursor/User"],
      mcp_config_paths: [
        "~/.cursor/mcp.json",
        "~/Library/Application Support/Cursor/User/mcp.json",
      ],
      warnings: [],
      requires_version_for_runnable: false,
    },
    AgentSpec::{
      id: "windsurf",
      name: "Windsurf",
      type_: "editor",
      command_candidates: ["windsurf"],
      version_arg: "--version",
      app_paths: ["/Applications/Windsurf.app"],
      config_paths: ["~/Library/Application Support/Windsurf/User", "~/.codeium"],
      mcp_config_paths: [
        "~/.codeium/windsurf/mcp_config.json",
        "~/Library/Application Support/Windsurf/User/mcp.json",
      ],
      warnings: [],
      requires_version_for_runnable: false,
    },
    AgentSpec::{
      id: "vscode-copilot",
      name: "VS Code Copilot",
      type_: "editor",
      command_candidates: ["code"],
      version_arg: "--version",
      app_paths: ["/Applications/Visual Studio Code.app"],
      config_paths: ["~/Library/Application Support/Code/User"],
      mcp_config_paths: ["~/Library/Application Support/Code/User/mcp.json"],
      warnings: [
        "VS Code Copilot extension presence is not validated without reading extension metadata.",
      ],
      requires_version_for_runnable: false,
    },
    AgentSpec::{
      id: "codex-desktop",
      name: "Codex Desktop",
      type_: "desktop",
      command_candidates: [],
      version_arg: "",
      app_paths: ["/Applications/Codex.app", "/Applications/OpenAI Codex.app"],
      config_paths: ["~/.codex"],
      mcp_config_paths: ["~/.codex/config.toml"],
      warnings: [],
      requires_version_for_runnable: false,
    },
  ]
}
