import { defineCommand } from "citty";
import { collectHostProbe, discover } from "@rivus/agent-finder-core";
import { summarizeAgents } from "../summary/summarize-agents.js";

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Print aggregate discovery diagnostics"
  },
  run() {
    const report = discover(collectHostProbe());
    const summary = summarizeAgents(report.agents);

    console.log(`Total providers: ${summary.total}`);
    console.log(`Runnable: ${summary.runnable}`);
    console.log(`Found: ${summary.found}`);
    console.log(`Missing: ${summary.missing}`);
    console.log(`Unknown: ${summary.unknown}`);
    if (summary.warnings.length > 0) {
      console.log("Warnings:");
      for (const warning of summary.warnings) {
        console.log(`- ${warning}`);
      }
    }
  }
});
