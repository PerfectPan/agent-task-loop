import { defineCommand } from "citty";
import { collectHostProbe, discover } from "@rivus/agent-finder-core";
import { summarizeAgents } from "../summary/summarize-agents.js";
import { STATUS_THEME } from "../formatters/agent-table.js";
import { style } from "../formatters/render.js";

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Print aggregate discovery diagnostics"
  },
  run() {
    const report = discover(collectHostProbe());
    const summary = summarizeAgents(report.agents);

    console.log(style.bold(`Total providers: ${summary.total}`));
    for (const status of ["runnable", "found", "missing", "unknown"] as const) {
      const theme = STATUS_THEME[status];
      const label = `${theme.label.charAt(0).toUpperCase()}${theme.label.slice(1)}:`;
      console.log(theme.color(`${theme.glyph} ${label.padEnd(9)} ${summary[status]}`));
    }

    if (summary.warnings.length > 0) {
      console.log("");
      console.log(style.yellow(`Warnings (${summary.warnings.length}):`));
      for (const warning of summary.warnings) {
        console.log(style.dim(`- ${warning}`));
      }
    }
  }
});
