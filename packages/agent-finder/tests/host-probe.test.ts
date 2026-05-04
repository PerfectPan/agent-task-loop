import { describe, expect, test } from "vitest";
import { collectHostProbe } from "../src/index";

describe("@rivus/agent-finder-core host probe", () => {
  test("collects host facts through injected read-only operations", () => {
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
