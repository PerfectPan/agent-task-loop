#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distEntrypoint = path.join(packageRoot, "dist", "cli.js");
const sourceEntrypoint = path.join(packageRoot, "src", "cli.ts");
const tsxLoader = path.join(packageRoot, "node_modules", "tsx", "dist", "loader.mjs");

const forceSource = process.env.AGENT_FINDER_FORCE_SOURCE === "1";
const canRunFromSource = existsSync(sourceEntrypoint) && existsSync(tsxLoader);
const args =
  forceSource || canRunFromSource
    ? ["--import", tsxLoader, sourceEntrypoint, ...process.argv.slice(2)]
    : [distEntrypoint, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
