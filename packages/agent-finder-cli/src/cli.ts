import { defineCommand, runMain } from "citty";
import {
  collectHostProbe,
  discover,
  inspectProvider,
  listProviders,
  type AgentRecord
} from "@rivus/agent-finder-core";

const providerListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List supported provider IDs and display names"
  },
  run() {
    for (const provider of listProviders()) {
      console.log(`${provider.id}\t${provider.displayName}\t${provider.adapterMode}`);
    }
  }
});

const providerInspectCommand = defineCommand({
  meta: {
    name: "inspect",
    description: "Show provider metadata without reading local config contents"
  },
  args: {
    id: {
      type: "positional",
      required: true,
      description: "Provider ID"
    }
  },
  run({ args }) {
    const provider = inspectProvider(String(args.id));
    if (!provider) {
      console.error(`Unknown provider: ${String(args.id)}`);
      process.exitCode = 1;
      return;
    }

    console.log(`ID: ${provider.id}`);
    console.log(`Name: ${provider.displayName}`);
    console.log(`Kind: ${provider.kind}`);
    console.log(`Adapter: ${provider.adapterMode}`);
    console.log(`Commands: ${provider.commandCandidates.join(", ") || "-"}`);
    console.log(`App paths: ${provider.appPathCandidates.join(", ") || "-"}`);
    console.log(`Config paths: ${provider.configPathCandidates.join(", ") || "-"}`);
    console.log(`MCP config paths: ${provider.mcpConfigPathCandidates.join(", ") || "-"}`);
    console.log(`Version probe: ${provider.versionProbe ?? "-"}`);
    if (provider.warnings.length > 0) {
      console.log(`Warnings: ${provider.warnings.join("; ")}`);
    }
  }
});

const providerCommand = defineCommand({
  meta: {
    name: "provider",
    description: "Inspect supported providers"
  },
  subCommands: {
    list: providerListCommand,
    inspect: providerInspectCommand
  }
});

const scanCommand = defineCommand({
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
      console.log(
        `${agent.status}\t${agent.type}\t${agent.name}\t${agent.command ?? agent.app_path ?? "-"}`
      );
    }
  }
});

const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Print aggregate discovery diagnostics"
  },
  run() {
    const report = discover(collectHostProbe());
    const summary = summarize(report.agents);

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

export const main = defineCommand({
  meta: {
    name: "agent-finder",
    version: "0.1.0",
    description: "Local code agent discovery CLI"
  },
  subCommands: {
    scan: scanCommand,
    provider: providerCommand,
    doctor: doctorCommand
  }
});

if (
  process.argv[2] === "provider" &&
  (process.argv[3] === "-h" || process.argv[3] === "--help")
) {
  console.log(`Inspect supported providers (agent-finder provider v0.1.0)

USAGE agent-finder provider list|inspect

COMMANDS

     list    List supported provider IDs and display names
  inspect    Show provider metadata without reading local config contents

Use agent-finder provider <command> --help for more information about a command.`);
  process.exit(0);
}

runMain(main);

function summarize(agents: AgentRecord[]) {
  const summary = {
    total: agents.length,
    runnable: 0,
    found: 0,
    missing: 0,
    unknown: 0,
    warnings: [] as string[]
  };

  for (const agent of agents) {
    summary[agent.status] += 1;
    for (const warning of agent.warnings) {
      summary.warnings.push(`${agent.id}: ${warning}`);
    }
  }

  return summary;
}
