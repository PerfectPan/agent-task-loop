///|
pub fn provider_specs_json() -> String {
  @catalog.known_provider_specs().to_json().stringify(indent=2)
}
