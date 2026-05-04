///|
test "doctor aggregates statuses and warnings" {
  let probe = @model.Probe::{
    os: "linux",
    arch: "x64",
    home: "/home/tester",
    generated_at: "2026-05-03T00:00:00Z",
    commands: {},
    executable_paths: {},
    existing_paths: { "/home/tester/.config/opencode": true },
    versions: {},
  }
  let summary = doctor(@scanner.scan(probe))
  assert_eq(summary.total, 26)
  assert_eq(summary.found, 1)
  assert_eq(summary.runnable, 0)
  assert_eq(summary.missing, 25)
  assert_true(summary.warnings.length() > 0)
}
