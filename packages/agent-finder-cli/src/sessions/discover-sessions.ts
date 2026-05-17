import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import type { SessionRecord } from "./session-record.js";

const SESSION_FILE_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".txt", ".log"]);

function defaultRoots(): string[] {
  const home = homedir();
  return [join(home, ".codex", "sessions"), join(home, ".claude", "projects"), join(home, ".local", "share", "opencode")];
}

function stringField(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

async function readJsonMetadata(path: string): Promise<Record<string, unknown>> {
  if (extname(path) !== ".json") {
    return {};
  }

  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function walkSessionFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries.map(async entry => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return walkSessionFiles(path);
      }
      if (entry.isFile() && SESSION_FILE_EXTENSIONS.has(extname(entry.name))) {
        return [path];
      }
      return [];
    })
  );

  return files.flat();
}

async function buildSessionRecord(path: string): Promise<SessionRecord> {
  const metadata = await readJsonMetadata(path);
  const fileStat = await stat(path);

  return {
    id: stringField(metadata, ["id", "sessionId", "session_id"]) ?? basename(path, extname(path)),
    agent: stringField(metadata, ["agent", "provider", "tool"]) ?? "unknown",
    title: stringField(metadata, ["title", "summary", "task"]) ?? basename(path),
    path,
    updatedAt: stringField(metadata, ["updatedAt", "updated_at", "lastModifiedAt"]) ?? fileStat.mtime.toISOString()
  };
}

export async function discoverSessions(input: { roots?: string[] } = {}): Promise<SessionRecord[]> {
  const roots = input.roots && input.roots.length > 0 ? input.roots : defaultRoots();
  const paths = (await Promise.all(roots.map(root => walkSessionFiles(root)))).flat();
  const records = await Promise.all(paths.map(path => buildSessionRecord(path)));

  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
