///|
pub fn command_candidates_json() -> String {
  known_command_candidates().to_json().stringify(indent=2)
}
