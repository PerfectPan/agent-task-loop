import { defineCommand } from "citty";
import { formatSessionRecordLine } from "../formatters/session-record-line.js";
import { discoverSessions } from "../sessions/discover-sessions.js";

export const sessionListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List local coding agent session records"
  },
  args: {
    root: {
      type: "string",
      description: "Session root directory to scan"
    },
    json: {
      type: "boolean",
      default: false,
      description: "Print stable JSON"
    }
  },
  async run({ args }) {
    const roots = typeof args.root === "string" ? [args.root] : undefined;
    const sessions = await discoverSessions({ roots });

    if (args.json) {
      console.log(
        JSON.stringify(
          {
            schema_version: "0.1",
            sessions
          },
          null,
          2
        )
      );
      return;
    }

    console.log("UPDATED_AT\tAGENT\tSESSION\tTITLE\tPATH");
    for (const session of sessions) {
      console.log(formatSessionRecordLine(session));
    }
  }
});
