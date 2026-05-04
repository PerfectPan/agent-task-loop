///|
pub fn to_json_string(report : @model.DiscoveryReport) -> String {
  report.to_json().stringify(indent=2)
}
