import { describe, expect, it } from "vitest";
import type { Session } from "@rivus/agent-sessions";
import { relativeAge, renderInspect, renderSessionTable } from "../src/sessions/view.js";

const NOW = Date.parse("2026-06-15T12:00:00Z");

const SESSIONS: Session[] = [
  { id: "aaaaaaaa-1111-4111-8111-111111111111", agent: "codex", path: "/c/a.jsonl", updatedAt: "2026-06-15T11:00:00Z" },
  { id: "bbbbbbbb-2222-4222-8222-222222222222", agent: "claude", path: "/cl/b.jsonl", updatedAt: "2026-06-13T12:00:00Z" }
];

describe("relativeAge", () => {
  it("formats seconds/minutes/hours/days and handles missing/invalid", () => {
    expect(relativeAge("2026-06-15T11:59:30Z", NOW)).toBe("30s");
    expect(relativeAge("2026-06-15T11:30:00Z", NOW)).toBe("30m");
    expect(relativeAge("2026-06-15T11:00:00Z", NOW)).toBe("1h");
    expect(relativeAge("2026-06-13T12:00:00Z", NOW)).toBe("2d");
    expect(relativeAge("", NOW)).toBe("-");
    expect(relativeAge("not-a-date", NOW)).toBe("-");
  });
});

describe("renderSessionTable", () => {
  it("renders a header + a row per session with agent, id and age", () => {
    const lines = renderSessionTable(SESSIONS, NOW).join("\n");
    expect(lines).toContain("AGENT");
    expect(lines).toContain("codex");
    expect(lines).toContain("claude");
    expect(lines).toContain("1h");
    expect(lines).toContain("2d");
    expect(lines).toContain(SESSIONS[0].id);
  });

  it("shows an empty-state line when there are no sessions", () => {
    expect(renderSessionTable([], NOW)).toEqual(["No sessions found."]);
  });
});

describe("renderInspect", () => {
  it("renders metadata header and transcript body", () => {
    const out = renderInspect(SESSIONS[0], [{ role: "assistant", text: "done" }], NOW).join("\n");
    expect(out).toContain("Session:");
    expect(out).toContain(SESSIONS[0].id);
    expect(out).toContain("codex");
    expect(out).toContain("assistant: done");
  });

  it("notes an empty transcript", () => {
    const out = renderInspect(SESSIONS[0], [], NOW).join("\n");
    expect(out).toContain("(no transcript)");
  });
});
