import { accessSync, constants, existsSync } from "node:fs";
import { delimiter } from "node:path";
import { execFileSync } from "node:child_process";
import { arch, homedir, platform } from "node:os";
import { listCommandCandidates } from "../application/list-command-candidates.js";
import { listPathCandidates } from "../application/list-path-candidates.js";
import { listProviders } from "../application/list-providers.js";
import type { HostProbe, HostProbeCollector } from "../contracts/types.js";
import { expandPath } from "../support/expand-path.js";
import { resolveCommand } from "./resolve-command.js";

export function collectHostProbe(options: HostProbeCollector = {}): HostProbe {
  const hostOs = options.os ?? platform();
  const hostArch = options.arch ?? arch();
  const home = options.home ?? homedir();
  const now = options.now ?? (() => new Date().toISOString());
  const commandResolver =
    options.resolveCommand ??
    ((command: string) =>
      resolveCommand(command, {
        path: process.env.PATH ?? "",
        pathExt: process.env.PATHEXT,
        delimiter,
        fileExists: existsSync
      }));
  const executableChecker = options.isExecutable ?? defaultIsExecutable;
  const pathChecker = options.pathExists ?? existsSync;
  const versionReader = options.readVersion ?? defaultReadVersion;
  const commands: Record<string, string> = {};
  const executablePaths: Record<string, boolean> = {};
  const existingPaths: Record<string, boolean> = {};
  const versions: Record<string, string> = {};

  for (const command of listCommandCandidates()) {
    const resolved = commandResolver(command);
    if (resolved) {
      commands[command] = resolved;
      executablePaths[resolved] = executableChecker(resolved);
    }
  }

  for (const path of listPathCandidates()) {
    const expanded = expandPath(path, home);
    existingPaths[expanded] = pathChecker(expanded);
  }

  for (const provider of listProviders()) {
    if (!provider.versionProbe) {
      continue;
    }
    for (const command of provider.commandCandidates) {
      const resolved = commands[command];
      if (!resolved || !executablePaths[resolved]) {
        continue;
      }
      const args = provider.versionProbe.split(" ").filter(Boolean);
      const version = versionReader(resolved, args);
      if (version) {
        versions[`${resolved} ${provider.versionProbe}`] = version;
      }
    }
  }

  return {
    os: hostOs,
    arch: hostArch,
    home,
    generatedAt: now(),
    commands,
    executablePaths,
    existingPaths,
    versions
  };
}

function defaultIsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return process.platform === "win32" && /\.(?:com|exe|bat|cmd)$/iu.test(path);
  }
}

function defaultReadVersion(path: string, args: string[]): string | null {
  try {
    return execFileSync(path, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500
    }).trim();
  } catch {
    return null;
  }
}
