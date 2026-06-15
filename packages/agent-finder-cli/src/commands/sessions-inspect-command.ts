import { defineCommand } from "citty";
import { defaultRegistry } from "@rivus/agent-sessions";
import { renderInspect } from "../sessions/view.js";

export const sessionsInspectCommand = defineCommand({
  meta: {
    name: "inspect",
    description: "Show a session's metadata and transcript"
  },
  args: {
    id: { type: "positional", required: true, description: "Session id" },
    json: { type: "boolean", default: false, description: "Print stable JSON" }
  },
  async run({ args }) {
    const id = String(args.id);
    const registry = defaultRegistry();
    const session = (await registry.list()).find((s) => s.id === id);
    if (!session) {
      console.error(`Unknown session: ${id}`);
      process.exitCode = 1;
      return;
    }

    const transcript = await registry.getTranscript(id);
    const resumeCommand = await registry.resumeCommand(id);
    if (args.json) {
      console.log(JSON.stringify({ schema_version: "0.1", session, transcript, resumeCommand }, null, 2));
      return;
    }

    for (const line of renderInspect(session, transcript, Date.now(), resumeCommand)) {
      console.log(line);
    }
  }
});
