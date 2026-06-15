import { defineCommand } from "citty";
import { sessionsBrowseCommand } from "./sessions-browse-command.js";
import { sessionsInspectCommand } from "./sessions-inspect-command.js";
import { sessionsListCommand } from "./sessions-list-command.js";
import { sessionsResumeCommand } from "./sessions-resume-command.js";

export const sessionsCommand = defineCommand({
  meta: {
    name: "sessions",
    description: "Browse and inspect local coding-agent sessions (Codex, Claude)"
  },
  subCommands: {
    list: sessionsListCommand,
    inspect: sessionsInspectCommand,
    browse: sessionsBrowseCommand,
    resume: sessionsResumeCommand
  }
});
