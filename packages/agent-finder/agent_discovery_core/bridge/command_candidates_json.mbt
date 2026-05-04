///|
pub fn command_candidates_json() -> String {
  @catalog.known_command_candidates().to_json().stringify(indent=2)
}
