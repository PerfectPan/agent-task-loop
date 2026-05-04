///|
pub fn doctor(report : @model.DiscoveryReport) -> @model.DoctorSummary {
  let mut runnable = 0
  let mut found = 0
  let mut missing = 0
  let mut unknown = 0
  let warnings = Array::new()
  for agent in report.agents {
    match agent.status {
      "runnable" => runnable += 1
      "found" => found += 1
      "missing" => missing += 1
      _ => unknown += 1
    }
    for warning in agent.warnings {
      warnings.push(agent.id + ": " + warning)
    }
  }
  @model.DoctorSummary::{
    total: report.agents.length(),
    runnable,
    found,
    missing,
    unknown,
    warnings,
  }
}
