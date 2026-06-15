import { defineCommand } from "citty";
import { collectHostProbe, discover } from "@rivus/agent-finder-core";
import { renderAgentTable, renderScanSummary } from "../formatters/agent-table.js";

export const scanCommand = defineCommand({
  meta: {
    name: "scan",
    description: "Scan local provider inventory"
  },
  args: {
    json: {
      type: "boolean",
      default: false,
      description: "Print stable JSON"
    }
  },
  run({ args }) {
    const report = discover(collectHostProbe());
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    for (const line of renderAgentTable(report.agents)) {
      console.log(line);
    }
    console.log("");
    for (const line of renderScanSummary(report.agents)) {
      console.log(line);
    }
  }
});
