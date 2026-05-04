import { scan_probe_json } from "./moonbit/agent_discovery_core.js";
import type { DiscoveryReport, HostProbe } from "./types.js";

export function discover(probe: HostProbe): DiscoveryReport {
  const report = JSON.parse(scan_probe_json(JSON.stringify(toMoonBitProbe(probe)))) as
    | DiscoveryReport
    | { error: string };
  if ("error" in report) {
    throw new Error(report.error);
  }
  return report;
}

function toMoonBitProbe(probe: HostProbe) {
  return {
    os: probe.os,
    arch: probe.arch,
    home: probe.home,
    generated_at: probe.generatedAt,
    commands: probe.commands,
    executable_paths: probe.executablePaths,
    existing_paths: probe.existingPaths,
    versions: probe.versions
  };
}
