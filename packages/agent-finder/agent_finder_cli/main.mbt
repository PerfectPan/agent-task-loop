fn main {
  let args = @env.args()
  if has_arg(args, "scan") {
    let report = scan_host()
    if has_arg(args, "--json") {
      println(@core.to_json_string(report))
    } else {
      print_scan(report)
    }
  } else if has_arg(args, "doctor") {
    let report = scan_host()
    print_doctor(@core.doctor(report), report)
  } else {
    print_help()
  }
}

fn scan_host() -> @core.DiscoveryReport {
  let home = host_home()
  let commands : Map[String, String] = {}
  let executable_paths : Map[String, Bool] = {}
  for command in @core.known_command_candidates() {
    match optional_string(which_command(command)) {
      Some(path) => {
        commands.set(command, path)
        executable_paths.set(path, path_executable(path))
      }
      None => ()
    }
  }
  let existing_paths : Map[String, Bool] = {}
  for path in @core.known_path_candidates() {
    let expanded = @core.expand_path(path, home)
    existing_paths.set(expanded, path_exists(expanded))
  }
  let versions : Map[String, String] = {}
  add_versions(commands, versions)
  @core.scan(@core.Probe::{
    os: host_os(),
    arch: host_arch(),
    home,
    generated_at: generated_at(),
    commands,
    executable_paths,
    existing_paths,
    versions,
  })
}

fn add_versions(commands : Map[String, String], versions : Map[String, String]) -> Unit {
  add_version(commands, versions, "codex", "--version")
  add_version(commands, versions, "claude", "--version")
  add_version(commands, versions, "gemini", "--version")
  add_version(commands, versions, "opencode", "--version")
  add_version(commands, versions, "aider", "--version")
  add_version(commands, versions, "github-copilot-cli", "copilot --version")
  add_version(commands, versions, "gh", "copilot --version")
  add_version(commands, versions, "cursor", "--version")
  add_version(commands, versions, "windsurf", "--version")
  add_version(commands, versions, "code", "--version")
}

fn add_version(
  commands : Map[String, String],
  versions : Map[String, String],
  command : String,
  version_arg : String
) -> Unit {
  match commands.get(command) {
    Some(path) =>
      match optional_string(read_version(path, version_arg)) {
        Some(version) => versions.set(path + " " + version_arg, version)
        None => ()
      }
    None => ()
  }
}

fn optional_string(value : String) -> String? {
  if value.is_empty() {
    None
  } else {
    Some(value)
  }
}

fn print_scan(report : @core.DiscoveryReport) -> Unit {
  println("agent-finder scan")
  println("host: " + report.host.os + "/" + report.host.arch)
  println("generated_at: " + report.generated_at)
  println("")
  println("status    type     agent                 location")
  println("--------  -------  --------------------  ------------------------------")
  for agent in report.agents {
    println(
      agent.status.pad_end(8, ' ') + "  " +
      agent.type_.pad_end(7, ' ') + "  " +
      agent.name.pad_end(20, ' ') + "  " +
      location(agent),
    )
  }
}

fn print_doctor(summary : @core.DoctorSummary, report : @core.DiscoveryReport) -> Unit {
  println("agent-finder doctor")
  println("total: " + summary.total.to_string())
  println("runnable: " + summary.runnable.to_string())
  println("found: " + summary.found.to_string())
  println("missing: " + summary.missing.to_string())
  println("unknown: " + summary.unknown.to_string())
  println("")
  for agent in report.agents {
    if agent.status == "missing" {
      println("missing: " + agent.name)
    }
  }
  if summary.warnings.length() > 0 {
    println("")
    println("warnings:")
    for warning in summary.warnings {
      println("- " + warning)
    }
  }
}

fn print_help() -> Unit {
  println("Usage:")
  println("  agent-finder scan")
  println("  agent-finder scan --json")
  println("  agent-finder doctor")
}

fn has_arg(args : Array[String], expected : String) -> Bool {
  for arg in args {
    if arg == expected {
      return true
    }
  }
  false
}

fn location(agent : @core.AgentRecord) -> String {
  match agent.command {
    Some(path) => path
    None =>
      match agent.app_path {
        Some(path) => path
        None => "-"
      }
  }
}
