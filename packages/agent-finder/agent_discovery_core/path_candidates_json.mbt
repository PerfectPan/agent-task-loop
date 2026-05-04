///|
pub fn path_candidates_json() -> String {
  known_path_candidates().to_json().stringify(indent=2)
}
