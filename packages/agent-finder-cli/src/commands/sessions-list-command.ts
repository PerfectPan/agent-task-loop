import { defineCommand } from "citty";
import { defaultRegistry } from "@rivus/agent-sessions";
import { renderSessionTable } from "../sessions/view.js";

export const sessionsListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List local agent sessions across tools"
  },
  args: {
    agent: { type: "string", description: "Filter by agent (codex|claude)" },
    filter: { type: "string", description: "Substring match on session id / path" },
    json: { type: "boolean", default: false, description: "Print stable JSON" }
  },
  async run({ args }) {
    const registry = defaultRegistry();
    let sessions = await registry.list({
      filter: typeof args.filter === "string" ? args.filter : undefined
    });
    if (typeof args.agent === "string") {
      sessions = sessions.filter((s) => s.agent === args.agent);
    }

    if (args.json) {
      console.log(JSON.stringify({ schema_version: "0.1", sessions }, null, 2));
      return;
    }

    for (const line of renderSessionTable(sessions, Date.now())) {
      console.log(line);
    }
  }
});
