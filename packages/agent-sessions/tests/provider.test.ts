import { describe, expect, it } from "vitest";
import {
  FsSessionProvider,
  SessionRegistry,
  claudeProvider,
  codexProvider,
  type SessionProvider
} from "../src/index.js";

const CODEX_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLAUDE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const CODEX_LINE = '{"payload":{"type":"agent_message","message":"hi from codex"}}';
const CLAUDE_LINE = '{"message":{"role":"user","content":"hi from claude"}}';

function fakeProvider(opts: {
  agent: "codex" | "claude";
  root: string;
  file: string;
  id: string;
  content: string;
  mtimeMs: number;
}): FsSessionProvider {
  return new FsSessionProvider({
    agent: opts.agent,
    roots: [{ path: opts.root, agent: opts.agent }],
    readdir: async (path) =>
      path === opts.root ? [{ name: opts.file, isDirectory: () => false }] : Promise.reject(new Error("ENOENT")),
    stat: async () => ({ mtimeMs: opts.mtimeMs }),
    readFile: async (path) => (path === `${opts.root}/${opts.file}` ? opts.content : Promise.reject(new Error("ENOENT")))
  });
}

describe("FsSessionProvider", () => {
  const provider = fakeProvider({
    agent: "codex",
    root: "/codex",
    file: `rollout-${CODEX_ID}.jsonl`,
    id: CODEX_ID,
    content: CODEX_LINE,
    mtimeMs: Date.parse("2026-06-01T00:00:00Z")
  });

  it("lists sessions with agent + path + mtime", async () => {
    const sessions = await provider.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: CODEX_ID, agent: "codex", path: `/codex/rollout-${CODEX_ID}.jsonl` });
  });

  it("parses the transcript for a known id and returns [] for unknown", async () => {
    expect(await provider.getTranscript(CODEX_ID)).toEqual([{ role: "assistant", text: "hi from codex" }]);
    expect(await provider.getTranscript("no-such-id")).toEqual([]);
  });

  it("filters by substring", async () => {
    expect(await provider.list({ filter: CODEX_ID.slice(0, 8) })).toHaveLength(1);
    expect(await provider.list({ filter: "zzz-nomatch" })).toHaveLength(0);
  });

  it("returns null resumeCommand by default (resume wired in P5)", async () => {
    expect(await provider.resumeCommand(CODEX_ID)).toBeNull();
  });

  it("uses an injected resume builder when provided", async () => {
    const resumable = codexProvider({
      home: "/home/x",
      readdir: async (path) =>
        path === "/home/x/.codex/sessions" ? [{ name: `${CODEX_ID}.jsonl`, isDirectory: () => false }] : [],
      stat: async () => ({ mtimeMs: 0 }),
      resume: (s) => `codex resume ${s.id}`
    });
    expect(await resumable.resumeCommand(CODEX_ID)).toBe(`codex resume ${CODEX_ID}`);
  });
});

describe("default resume commands (verified against the CLIs)", () => {
  it("codexProvider resumes via `codex resume <id>`", async () => {
    const provider = codexProvider({
      home: "/h",
      readdir: async (path) =>
        path === "/h/.codex/sessions" ? [{ name: `${CODEX_ID}.jsonl`, isDirectory: () => false }] : [],
      stat: async () => ({ mtimeMs: 0 })
    });
    expect(await provider.resumeCommand(CODEX_ID)).toBe(`codex resume ${CODEX_ID}`);
  });

  it("claudeProvider resumes via `claude --resume <id>`", async () => {
    const provider = claudeProvider({
      home: "/h",
      readdir: async (path) =>
        path === "/h/.claude/projects" ? [{ name: `${CLAUDE_ID}.jsonl`, isDirectory: () => false }] : [],
      stat: async () => ({ mtimeMs: 0 })
    });
    expect(await provider.resumeCommand(CLAUDE_ID)).toBe(`claude --resume ${CLAUDE_ID}`);
  });

  it("returns null for an unknown id", async () => {
    const provider = codexProvider({ home: "/h", readdir: async () => [], stat: async () => ({ mtimeMs: 0 }) });
    expect(await provider.resumeCommand("nope")).toBeNull();
  });
});

describe("SessionRegistry", () => {
  const codex = fakeProvider({
    agent: "codex",
    root: "/codex",
    file: `${CODEX_ID}.jsonl`,
    id: CODEX_ID,
    content: CODEX_LINE,
    mtimeMs: Date.parse("2026-06-01T00:00:00Z")
  });
  const claude = fakeProvider({
    agent: "claude",
    root: "/claude",
    file: `${CLAUDE_ID}.jsonl`,
    id: CLAUDE_ID,
    content: CLAUDE_LINE,
    mtimeMs: Date.parse("2026-06-03T00:00:00Z")
  });
  const registry = new SessionRegistry([codex, claude]);

  it("merges sessions across providers, newest first", async () => {
    const sessions = await registry.list();
    expect(sessions.map((s) => s.agent)).toEqual(["claude", "codex"]); // claude is newer
  });

  it("routes getTranscript to the owning provider", async () => {
    expect(await registry.getTranscript(CLAUDE_ID)).toEqual([{ role: "user", text: "hi from claude" }]);
    expect(await registry.getTranscript(CODEX_ID)).toEqual([{ role: "assistant", text: "hi from codex" }]);
    expect(await registry.getTranscript("unknown")).toEqual([]);
  });

  it("exposes its providers", () => {
    expect(registry.getProviders()).toHaveLength(2);
    expect(registry.getProviders().map((p: SessionProvider) => p.agent)).toEqual(["codex", "claude"]);
  });
});
