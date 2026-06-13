import { defineCommand } from "citty";
import { sessionListCommand } from "./session-list-command.js";

export const sessionsCommand = defineCommand({
  meta: {
    name: "sessions",
    description: "Browse local coding agent sessions"
  },
  subCommands: {
    list: sessionListCommand
  }
});
