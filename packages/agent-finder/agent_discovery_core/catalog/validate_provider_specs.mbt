///|
pub fn validate_provider_specs(_specs : Array[@model.ProviderSpec]) -> Array[String] {
  let errors = Array::new()
  let seen = Array::new()
  for spec in _specs {
    if seen.contains(spec.id) {
      errors.push("duplicate provider id: " + spec.id)
    } else {
      seen.push(spec.id)
    }
    if !is_supported_adapter_mode(spec.adapter_mode) {
      errors.push(
        "unsupported adapter mode for " + spec.id + ": " + spec.adapter_mode,
      )
    }
  }
  errors
}

///|
fn is_supported_adapter_mode(mode : String) -> Bool {
  mode == "metadata" ||
  mode == "versioned-cli" ||
  mode == "app-only" ||
  mode == "extension"
}
