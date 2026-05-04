///|
pub fn path_candidates_json() -> String {
  @catalog.known_path_candidates().to_json().stringify(indent=2)
}
