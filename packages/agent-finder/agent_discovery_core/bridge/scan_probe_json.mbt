///|
pub fn scan_probe_json(probe_json : String) -> String {
  try {
    let json = @json.parse(probe_json)
    let probe : @model.Probe = @json.from_json(json)
    @scanner.scan(probe).to_json().stringify(indent=2)
  } catch {
    error =>
      {
        "schema_version": "0.1",
        "error": error.to_string(),
      }.to_json().stringify(indent=2)
  }
}
