import { trimTrailingSeparators } from "../support/trim-trailing-separators.js";

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
