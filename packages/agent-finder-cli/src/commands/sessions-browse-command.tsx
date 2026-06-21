import React from "react";
import { defineCommand } from "citty";
import { render } from "ink";
import { defaultRegistry } from "@rivus/agent-sessions";
import { SessionsBrowser } from "../tui/SessionsBrowser.js";

const ENTER_ALT_SCREEN = "[?1049h";
const LEAVE_ALT_SCREEN = "[?1049l";

export const sessionsBrowseCommand = defineCommand({
  meta: {
    name: "browse",
    description: "Interactively browse sessions and preview transcripts (requires a TTY)"
  },
  async run() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("`sessions browse` requires an interactive terminal (TTY). Use `agent-finder sessions list` for non-interactive output.");
      process.exitCode = 1;
      return;
    }

    const registry = defaultRegistry();
    const sessions = await registry.list();

    // Take over the alternate screen buffer; restore scrollback on exit.
    process.stdout.write(ENTER_ALT_SCREEN);
    const restore = () => process.stdout.write(LEAVE_ALT_SCREEN);
    process.once("exit", restore);

    const instance = render(
      <SessionsBrowser
        sessions={sessions}
        loadTranscript={(id) => registry.getTranscript(id)}
        nowMs={Date.now()}
      />
    );

    try {
      await instance.waitUntilExit();
    } finally {
      restore();
    }
  }
});
