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
