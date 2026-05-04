import { describe, expect, test } from "vitest";
import { discover, type HostProbe } from "../src/index";

describe("@rivus/agent-finder-core discover", () => {
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
});
