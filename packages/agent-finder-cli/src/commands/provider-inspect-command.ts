import { defineCommand } from "citty";
import { inspectProvider } from "@rivus/agent-finder-core";
import { formatProviderLines } from "../formatters/provider-lines.js";

export const providerInspectCommand = defineCommand({
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

    for (const line of formatProviderLines(provider)) {
      console.log(line);
    }
  }
});
