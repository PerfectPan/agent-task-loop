///|
pub fn expand_path(path : String, home : String) -> String {
  if path == "~" {
    home
  } else if path.has_prefix("~/"[:]) {
    home + path.unsafe_substring(start=1, end=path.length())
  } else {
    path
  }
}
