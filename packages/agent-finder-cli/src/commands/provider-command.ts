import { defineCommand } from "citty";
import { providerInspectCommand } from "./provider-inspect-command.js";
import { providerListCommand } from "./provider-list-command.js";

export const providerCommand = defineCommand({
  meta: {
    name: "provider",
    description: "Inspect supported providers"
  },
  subCommands: {
    list: providerListCommand,
    inspect: providerInspectCommand
  }
});
