import { describe, expect, it } from "vitest";
import { buildFsIndex, defaultSessionRoots, type SessionRoot } from "../src/index.js";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

/** Build an injectable fake fs from a flat `path -> entries | file` tree. */
function fakeFs(tree: Record<string, Array<{ name: string; dir?: boolean }>>, mtimes: Record<string, number> = {}) {
  const readdir = async (path: string) => {
    const entries = tree[path];
    if (!entries) throw new Error(`ENOENT: ${path}`);
    return entries.map((e) => ({ name: e.name, isDirectory: () => Boolean(e.dir) }));
  };
  const stat = async (path: string) => {
    if (!(path in mtimes)) throw new Error(`ENOENT: ${path}`);
    return { mtimeMs: mtimes[path] };
  };
  return { readdir, stat };
}

describe("buildFsIndex", () => {
  it("indexes UUID-named files under each root and attributes the agent + mtime", async () => {
    const { readdir, stat } = fakeFs(
      {
        "/codex": [{ name: `rollout-${UUID_A}.jsonl` }],
        "/claude": [{ name: "proj", dir: true }],
        "/claude/proj": [{ name: `${UUID_B}.jsonl` }]
      },
      {
        [`/codex/rollout-${UUID_A}.jsonl`]: Date.parse("2026-06-01T00:00:00Z"),
        [`/claude/proj/${UUID_B}.jsonl`]: Date.parse("2026-06-02T12:00:00Z")
      }
    );

    const index = await buildFsIndex({
      roots: [
        { path: "/codex", agent: "codex" },
        { path: "/claude", agent: "claude" }
      ],
      readdir,
      stat
    });

    expect(index.get(UUID_A)).toEqual({
      id: UUID_A,
      agent: "codex",
      path: `/codex/rollout-${UUID_A}.jsonl`,
      updatedAt: "2026-06-01T00:00:00.000Z"
    });
    expect(index.get(UUID_B)?.agent).toBe("claude");
    expect(index.get(UUID_B)?.path).toBe(`/claude/proj/${UUID_B}.jsonl`);
    expect(index.size).toBe(2);
  });

  it("skips non-UUID files and tolerates unreadable dirs / un-stat-able files", async () => {
    const { readdir, stat } = fakeFs({
      "/codex": [{ name: "README.md" }, { name: `s-${UUID_A}.jsonl` }, { name: "missing", dir: true }]
      // "/codex/missing" intentionally absent -> readdir throws, walk continues
    });
    const index = await buildFsIndex({ roots: [{ path: "/codex", agent: "codex" }], readdir, stat });
    expect([...index.keys()]).toEqual([UUID_A]);
    expect(index.get(UUID_A)?.updatedAt).toBe(""); // stat threw -> empty, not a crash
  });

  it("first match for an id wins", async () => {
    const { readdir, stat } = fakeFs({
      "/a": [{ name: `${UUID_A}.jsonl` }],
      "/b": [{ name: `${UUID_A}.jsonl` }]
    });
    const index = await buildFsIndex({
      roots: [
        { path: "/a", agent: "codex" },
        { path: "/b", agent: "claude" }
      ],
      readdir,
      stat
    });
    expect(index.size).toBe(1);
    expect(index.get(UUID_A)?.agent).toBe("codex");
  });

  it("respects the scan budget", async () => {
    const { readdir, stat } = fakeFs({
      "/codex": [{ name: `${UUID_A}.jsonl` }, { name: `${UUID_B}.jsonl` }]
    });
    const index = await buildFsIndex({
      roots: [{ path: "/codex", agent: "codex" }],
      readdir,
      stat,
      scanBudget: 2
    });
    expect(index.size).toBe(1); // budget exhausted at the second entry
  });

  it("defaultSessionRoots maps the two standard roots to their agents", () => {
    const roots = defaultSessionRoots("/home/me");
    expect(roots).toEqual<SessionRoot[]>([
      { path: "/home/me/.codex/sessions", agent: "codex" },
      { path: "/home/me/.claude/projects", agent: "claude" }
    ]);
  });
});
