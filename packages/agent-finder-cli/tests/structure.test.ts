import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const sourceRoot = join(process.cwd(), "src");

describe("@rivus/agent-finder-cli structure", () => {
  test("keeps the entrypoint thin and delegates commands to modules", () => {
    const cli = readFileSync(join(sourceRoot, "cli.ts"), "utf8");

    expect(cli.split("\n")).toHaveLength(5);
    expect(cli).toContain('import { main } from "./main.js";');
    expect(cli).toContain("runMain(main);");
  });

  test("organizes command, formatter, and summary responsibilities", () => {
    for (const path of [
      "main.ts",
      "commands/provider-command.ts",
      "commands/provider-list-command.ts",
      "commands/provider-inspect-command.ts",
      "commands/scan-command.ts",
      "commands/doctor-command.ts",
      "formatters/provider-lines.ts",
      "formatters/agent-record-line.ts",
      "summary/summarize-agents.ts"
    ]) {
      expect(existsSync(join(sourceRoot, path)), path).toBe(true);
    }
  });
});
