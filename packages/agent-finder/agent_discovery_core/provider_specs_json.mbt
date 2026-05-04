///|
pub fn provider_specs_json() -> String {
  known_provider_specs().to_json().stringify(indent=2)
}
