///|
pub fn known_command_candidates() -> Array[String] {
  let commands = Array::new()
  for spec in provider_specs() {
    for command in spec.command_candidates {
      if !commands.contains(command) {
        commands.push(command)
      }
    }
  }
  commands
}
