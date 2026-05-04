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
} derive(FromJson)

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
pub impl ToJson for ProviderSpec with to_json(self) -> Json {
  {
    "id": self.id,
    "display_name": self.display_name,
    "kind": self.kind,
    "adapter_mode": self.adapter_mode,
    "command_candidates": self.command_candidates,
    "app_path_candidates": self.app_path_candidates,
    "config_path_candidates": self.config_path_candidates,
    "mcp_config_path_candidates": self.mcp_config_path_candidates,
    "version_probe": option_string_to_json(self.version_probe),
    "warnings": self.warnings,
  }
}

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
