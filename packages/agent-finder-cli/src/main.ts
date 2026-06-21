import { defineCommand } from "citty";
import { doctorCommand } from "./commands/doctor-command.js";
import { providerCommand } from "./commands/provider-command.js";
import { scanCommand } from "./commands/scan-command.js";
import { sessionsCommand } from "./commands/sessions-command.js";
import { printProviderHelpAndExitIfRequested } from "./provider-help.js";

printProviderHelpAndExitIfRequested(process.argv);

export const main = defineCommand({
  meta: {
    name: "agent-finder",
    version: "0.1.0",
    description: "Local code agent discovery CLI"
  },
  subCommands: {
    scan: scanCommand,
    provider: providerCommand,
    doctor: doctorCommand,
    sessions: sessionsCommand
  }
});
