///|
pub fn to_json_string(report : DiscoveryReport) -> String {
  report.to_json().stringify(indent=2)
}
