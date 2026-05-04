///|
pub fn known_path_candidates() -> Array[String] {
  let paths = Array::new()
  for spec in provider_specs() {
    for path in spec.app_path_candidates {
      push_unique(paths, path)
    }
    for path in spec.config_path_candidates {
      push_unique(paths, path)
    }
    for path in spec.mcp_config_path_candidates {
      push_unique(paths, path)
    }
  }
  paths
}

///|
fn push_unique(items : Array[String], item : String) -> Unit {
  if !items.contains(item) {
    items.push(item)
  }
}
