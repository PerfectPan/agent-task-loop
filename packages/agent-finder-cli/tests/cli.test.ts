import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const cli = join(process.cwd(), "src", "cli.ts");
const loader = join(process.cwd(), "node_modules", "tsx", "dist", "loader.mjs");

function runCli(args: string[]) {
  const { VITEST, VITEST_WORKER_ID, ...env } = process.env;
  return spawnSync(process.execPath, ["--conditions=development", "--import", loader, cli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...env, NO_COLOR: "1" }
  });
}

function output(result: ReturnType<typeof runCli>) {
  return `${result.stdout}\n${result.stderr}`;
}

describe("@rivus/agent-finder-cli", () => {
  test("shows provider help as the baseline experience", () => {
    const result = runCli(["provider", "-h"]);

    expect(result.status).toBe(0);
    expect(output(result)).toContain("USAGE agent-finder provider list|inspect");
    expect(output(result)).toContain("Use agent-finder provider <command> --help");
  });

  test("lists supported providers", () => {
    const result = runCli(["provider", "list"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("codex");
    expect(result.stdout).toContain("amp");
  });

  test("inspects one provider without host access", () => {
    const result = runCli(["provider", "inspect", "codex"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Codex");
    expect(result.stdout).toContain("versioned-cli");
    expect(result.stdout).toContain("codex");
  });

  test("prints stable scan json", () => {
    const result = runCli(["scan", "--json"]);

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout) as {
      schema_version: string;
      agents: unknown[];
    };
    expect(json.schema_version).toBe("0.1");
    expect(json.agents).toHaveLength(26);
  });

  test("prints doctor summary", () => {
    const result = runCli(["doctor"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Total providers: 26");
    expect(result.stdout).toContain("Runnable:");
  });
});
