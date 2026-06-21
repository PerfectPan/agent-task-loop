import React from "react";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@rivus/agent-sessions";
import { SessionsBrowser } from "../src/tui/SessionsBrowser.js";

const NOW = Date.parse("2026-06-15T12:00:00Z");
const SESSIONS: Session[] = [
  { id: "aaaaaaaa-1111-4111-8111-111111111111", agent: "codex", path: "/c/a.jsonl", updatedAt: "2026-06-15T11:00:00Z" },
  { id: "bbbbbbbb-2222-4222-8222-222222222222", agent: "claude", path: "/cl/b.jsonl", updatedAt: "2026-06-15T10:00:00Z" }
];

describe("SessionsBrowser", () => {
  it("renders the list and loads the selected transcript", async () => {
    const loadTranscript = vi.fn(async () => [{ role: "assistant", text: "hello from transcript" }]);
    const { lastFrame } = render(<SessionsBrowser sessions={SESSIONS} loadTranscript={loadTranscript} nowMs={NOW} />);

    expect(lastFrame()).toContain("codex");
    expect(lastFrame()).toContain("claude");
    expect(lastFrame()).toContain("Sessions (2)");

    await vi.waitFor(() => expect(loadTranscript).toHaveBeenCalledWith(SESSIONS[0].id));
    await vi.waitFor(() => expect(lastFrame()).toContain("hello from transcript"));
  });

  it("shows the resume command for the selected session", async () => {
    const loadTranscript = vi.fn(async () => []);
    const loadResume = vi.fn(async (id: string) => `codex resume ${id}`);
    const { lastFrame } = render(
      <SessionsBrowser sessions={SESSIONS} loadTranscript={loadTranscript} loadResume={loadResume} nowMs={NOW} />
    );
    await vi.waitFor(() => expect(lastFrame()).toContain(`resume: codex resume ${SESSIONS[0].id}`));
  });

  it("navigates to the next session on down-arrow", async () => {
    const loadTranscript = vi.fn(async () => []);
    const { stdin } = render(<SessionsBrowser sessions={SESSIONS} loadTranscript={loadTranscript} nowMs={NOW} />);

    await vi.waitFor(() => expect(loadTranscript).toHaveBeenCalledWith(SESSIONS[0].id));
    stdin.write("[B"); // down arrow
    await vi.waitFor(() => expect(loadTranscript).toHaveBeenCalledWith(SESSIONS[1].id));
  });

  it("renders an empty state with no sessions", () => {
    const { lastFrame } = render(<SessionsBrowser sessions={[]} loadTranscript={vi.fn(async () => [])} nowMs={NOW} />);
    expect(lastFrame()).toContain("No sessions found.");
  });
});
