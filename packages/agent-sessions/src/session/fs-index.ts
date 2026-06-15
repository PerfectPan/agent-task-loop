import { readdir as nodeReaddir, stat as nodeStat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentKind, Session } from "./types.js";

/** Upper bound on directory entries scanned while indexing transcripts. */
const SCAN_BUDGET = 50_000;
const MAX_DEPTH = 6;
/** Session ids are UUIDs, embedded in codex filenames and naming claude files. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

type ReadDir = (path: string) => Promise<DirEntry[]>;
type Stat = (path: string) => Promise<{ mtimeMs: number }>;

/** A root directory to scan, tagged with the agent that owns it. */
export interface SessionRoot {
  path: string;
  agent: AgentKind;
}

export interface BuildFsIndexOptions {
  roots: SessionRoot[];
  readdir?: ReadDir;
  stat?: Stat;
  scanBudget?: number;
  maxDepth?: number;
}

/** The standard on-disk roots for the filesystem-backed agents (Codex, Claude). */
export function defaultSessionRoots(home: string = homedir()): SessionRoot[] {
  return [
    { path: join(home, ".codex", "sessions"), agent: "codex" },
    { path: join(home, ".claude", "projects"), agent: "claude" }
  ];
}

/**
 * Build a bounded `id → Session` index by walking the given roots for
 * UUID-named `.jsonl` transcripts. Generalized from agent-task-loop's
 * `fs-session-provider`: each session is attributed to the agent of the root it
 * was found under, and `updatedAt` is taken from the file mtime.
 *
 * The walk is bounded (`scanBudget` entries, `maxDepth` deep) and never throws —
 * unreadable directories and un-stat-able files are skipped. The first match
 * for a given id wins (cross-root UUID collisions are not expected for the two
 * default roots); custom roots can pass `agent: "unknown"`.
 */
export async function buildFsIndex(opts: BuildFsIndexOptions): Promise<Map<string, Session>> {
  const readdir: ReadDir = opts.readdir ?? ((path) => nodeReaddir(path, { withFileTypes: true }));
  const stat: Stat = opts.stat ?? ((path) => nodeStat(path));
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  let budget = opts.scanBudget ?? SCAN_BUDGET;

  const map = new Map<string, Session>();

  const walk = async (dir: string, agent: AgentKind, depth: number): Promise<void> => {
    if (depth > maxDepth || budget <= 0) return;
    let entries: DirEntry[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    const subdirs: string[] = [];
    for (const entry of entries) {
      if (--budget <= 0) return;
      if (entry.isDirectory()) {
        subdirs.push(join(dir, entry.name));
        continue;
      }
      const match = entry.name.match(UUID_RE);
      if (!match || map.has(match[0])) continue;
      const path = join(dir, entry.name);
      map.set(match[0], { id: match[0], agent, path, updatedAt: await mtimeIso(stat, path) });
    }
    for (const sub of subdirs) await walk(sub, agent, depth + 1);
  };

  for (const root of opts.roots) await walk(root.path, root.agent, 0);
  return map;
}

async function mtimeIso(stat: Stat, path: string): Promise<string> {
  try {
    const { mtimeMs } = await stat(path);
    return new Date(mtimeMs).toISOString();
  } catch {
    return "";
  }
}
