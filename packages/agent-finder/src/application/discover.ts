import { moonbitApi } from "../infrastructure/moonbit-api.js";
import type { DiscoveryReport, HostProbe } from "../contracts/types.js";

export function discover(probe: HostProbe): DiscoveryReport {
  return moonbitApi.discover(probe);
}
