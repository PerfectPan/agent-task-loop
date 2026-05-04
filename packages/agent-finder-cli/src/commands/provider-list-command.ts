import { defineCommand } from "citty";
import { listProviders } from "@rivus/agent-finder-core";

export const providerListCommand = defineCommand({
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
