import { describe, expect, test } from "vitest";
import { inspectProvider, listProviders } from "../src/index";

const providerIds = [
  "opencode",
  "openhands",
  "claude-code",
  "cline",
  "codebuddy",
  "codex",
  "command-code",
  "kiro-cli",
  "cursor",
  "antigravity",
  "roo-code",
  "github-copilot",
  "amp",
  "openclaw",
  "neovate",
  "pi",
  "qoder",
  "zencoder",
  "kimi-code-cli",
  "gemini-cli",
  "windsurf",
  "vscode-copilot",
  "codex-desktop",
  "aider",
  "hermes",
  "trae"
];

describe("@rivus/agent-finder-core provider API", () => {
  test("lists supported providers in stable RFC order", () => {
    expect(listProviders().map((provider) => provider.id)).toEqual(providerIds);
  });

  test("inspects provider metadata without host access", () => {
    expect(inspectProvider("codex")).toMatchObject({
      id: "codex",
      displayName: "Codex",
      adapterMode: "versioned-cli",
      commandCandidates: ["codex"],
      versionProbe: "--version"
    });
    expect(inspectProvider("missing-provider")).toBeNull();
  });
});
