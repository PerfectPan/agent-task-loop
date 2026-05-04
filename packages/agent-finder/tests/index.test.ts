import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  collectHostProbe,
  discover,
  inspectProvider,
  listProviders,
  resolveCommand,
  type HostProbe
} from "../src/index";

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

describe("@rivus/agent-finder-core", () => {
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

  test("discovers runnable provider from fixture probe with evidence", () => {
    const probe: HostProbe = {
      os: "darwin",
      arch: "arm64",
      home: "/tmp/agent-finder-home",
      generatedAt: "2026-05-03T00:00:00+08:00",
      commands: { codex: "/opt/homebrew/bin/codex" },
      executablePaths: { "/opt/homebrew/bin/codex": true },
      existingPaths: {
        "/tmp/agent-finder-home/.codex": true,
        "/tmp/agent-finder-home/.codex/config.toml": true
      },
      versions: { "/opt/homebrew/bin/codex --version": "codex 0.1.0" }
    };

    const report = discover(probe);
    const codex = report.agents.find((agent) => agent.id === "codex");

    expect(report.schema_version).toBe("0.1");
    expect(report.host).toEqual({ os: "darwin", arch: "arm64" });
    expect(codex).toMatchObject({
      status: "runnable",
      command: "/opt/homebrew/bin/codex",
      app_path: null,
      version: "codex 0.1.0"
    });
    expect(codex?.evidence.slice(0, 2)).toEqual([
      {
        kind: "command",
        value: "/opt/homebrew/bin/codex",
        exists: true,
        reason: "command resolved on PATH"
      },
      {
        kind: "version",
        value: "/opt/homebrew/bin/codex --version",
        exists: true,
        reason: "version probe exited successfully"
      }
    ]);
  });

  test("resolves Windows commands using PATHEXT without shelling", () => {
    const result = resolveCommand("code", {
      path: "C:\\Program Files\\Microsoft VS Code\\bin;C:\\Windows\\System32",
      pathExt: ".COM;.EXE;.BAT;.CMD",
      delimiter: ";",
      fileExists: (candidate) =>
        candidate === "C:\\Program Files\\Microsoft VS Code\\bin\\code.CMD"
    });

    expect(result).toBe("C:\\Program Files\\Microsoft VS Code\\bin\\code.CMD");
  });

  test("core package does not depend on CLI framework packages", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("citty");
  });

  test("collects host probe facts through injected read-only operations", () => {
    const probe = collectHostProbe({
      os: "linux",
      arch: "x64",
      home: "/home/tester",
      now: () => "2026-05-03T00:00:00Z",
      resolveCommand: (command) =>
        command === "codex" ? "/usr/local/bin/codex" : null,
      isExecutable: (path) => path === "/usr/local/bin/codex",
      pathExists: (path) => path === "/home/tester/.codex",
      readVersion: (path, args) =>
        path === "/usr/local/bin/codex" && args.join(" ") === "--version"
          ? "codex 0.1.0"
          : null
    });

    expect(probe.commands.codex).toBe("/usr/local/bin/codex");
    expect(probe.executablePaths["/usr/local/bin/codex"]).toBe(true);
    expect(probe.existingPaths["/home/tester/.codex"]).toBe(true);
    expect(probe.versions["/usr/local/bin/codex --version"]).toBe("codex 0.1.0");
  });
});
