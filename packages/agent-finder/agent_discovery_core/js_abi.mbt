///|
pub fn providers_json() -> String {
  @catalog.known_provider_specs().to_json().stringify(indent=2)
}

///|
pub fn command_candidates_json() -> String {
  @catalog.known_command_candidates().to_json().stringify(indent=2)
}

///|
pub fn path_candidates_json() -> String {
  @catalog.known_path_candidates().to_json().stringify(indent=2)
}

///|
pub fn scan_json(probe_json : String) -> String {
  try {
    let json = @json.parse(probe_json)
    let probe : @model.Probe = @json.from_json(json)
    @scanner.scan(probe).to_json().stringify(indent=2)
  } catch {
    error =>
      { "schema_version": "0.1", "error": error.to_string() }
      .to_json()
      .stringify(indent=2)
  }
}
