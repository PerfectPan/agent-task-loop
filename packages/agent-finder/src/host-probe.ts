import { accessSync, constants, existsSync } from "node:fs";
import { delimiter } from "node:path";
import { execFileSync } from "node:child_process";
import { arch, homedir, platform } from "node:os";
import { knownCommandCandidates, knownPathCandidates, providerSpecs } from "./providers.js";
import type { HostProbe, HostProbeCollector } from "./types.js";
import { expandPath, trimTrailingSeparators } from "./paths.js";

export function resolveCommand(
  command: string,
  options: {
    path: string;
    pathExt?: string;
    delimiter?: string;
    fileExists: (candidate: string) => boolean;
  }
): string | null {
  const pathDelimiter = options.delimiter ?? (process.platform === "win32" ? ";" : ":");
  const pathExt = options.pathExt ?? (process.platform === "win32" ? process.env.PATHEXT : "");
  const extensions = pathExt
    ? pathExt.split(";").filter(Boolean)
    : [""];
  const hasKnownExtension = extensions.some((ext) =>
    command.toLowerCase().endsWith(ext.toLowerCase())
  );
  const commandNames = hasKnownExtension
    ? [command]
    : extensions.map((ext) => `${command}${ext}`);

  for (const dir of options.path.split(pathDelimiter).filter(Boolean)) {
    const separator = dir.includes("\\") ? "\\" : "/";
    for (const name of commandNames) {
      const candidate = `${trimTrailingSeparators(dir)}${separator}${name}`;
      if (options.fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

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

  for (const command of knownCommandCandidates()) {
    const resolved = commandResolver(command);
    if (resolved) {
      commands[command] = resolved;
      executablePaths[resolved] = executableChecker(resolved);
    }
  }

  for (const path of knownPathCandidates()) {
    const expanded = expandPath(path, home);
    existingPaths[expanded] = pathChecker(expanded);
  }

  for (const provider of providerSpecs) {
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
