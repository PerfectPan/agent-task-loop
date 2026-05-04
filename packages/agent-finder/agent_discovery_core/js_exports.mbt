///|
pub fn provider_specs_json() -> String {
  @bridge.provider_specs_json()
}

///|
pub fn command_candidates_json() -> String {
  @bridge.command_candidates_json()
}

///|
pub fn path_candidates_json() -> String {
  @bridge.path_candidates_json()
}

///|
pub fn scan_probe_json(probe_json : String) -> String {
  @bridge.scan_probe_json(probe_json)
}
