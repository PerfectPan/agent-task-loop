#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(packageRoot, "moon.mod.json");

const result = spawnSync(
  "moon",
  [
    "run",
    "agent_finder_cli",
    "--manifest-path",
    manifestPath,
    "--target",
    "js",
    "--",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(`agent-finder: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
