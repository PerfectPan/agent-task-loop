import { moonbitApi } from "./moonbit-api.js";
import type { DiscoveryReport, HostProbe } from "./types.js";

export function discover(probe: HostProbe): DiscoveryReport {
  return moonbitApi.discover(probe);
}
