import { defineCommand } from "citty";
import { collectHostProbe, discover } from "@rivus/agent-finder-core";
import { formatAgentRecordLine } from "../formatters/agent-record-line.js";

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

    console.log("STATUS\tTYPE\tPROVIDER\tLOCATION");
    for (const agent of report.agents) {
      console.log(formatAgentRecordLine(agent));
    }
  }
});
