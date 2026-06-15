import { describe, expect, it } from "vitest";
import { parseTranscript, parseTranscriptLine, toLines } from "../src/index.js";

/** Helper: parse a line then render it back to the legacy string form. */
function line(raw: string): string | null {
  const entry = parseTranscriptLine(raw);
  return entry ? toLines([entry])[0] : null;
}

describe("parseTranscriptLine + toLines (codex rollout) — legacy golden output", () => {
  it("keeps agent and user messages", () => {
    expect(line('{"type":"event_msg","payload":{"type":"agent_message","message":"hi there"}}')).toBe(
      "assistant: hi there"
    );
    expect(line('{"payload":{"type":"user_message","message":"do x"}}')).toBe("user: do x");
  });

  it("flattens a message with role + content parts", () => {
    const raw =
      '{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}';
    expect(line(raw)).toBe("user: hello");
  });

  it("summarizes tool calls and drops noise", () => {
    expect(line('{"payload":{"type":"function_call","name":"shell"}}')).toBe("⚙ shell");
    expect(parseTranscriptLine('{"payload":{"type":"token_count"}}')).toBeNull();
    expect(parseTranscriptLine('{"payload":{"type":"function_call_output"}}')).toBeNull();
    expect(parseTranscriptLine('{"type":"session_meta","payload":{"type":"session_meta"}}')).toBeNull();
  });
});

describe("parseTranscriptLine + toLines (claude session) — legacy golden output", () => {
  it("extracts role + text from message.content and embeds tool markers", () => {
    const raw =
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"done"},{"type":"tool_use","name":"Edit"}]}}';
    expect(line(raw)).toBe("assistant: done ⚙ Edit");
  });

  it("handles a plain string content", () => {
    expect(line('{"message":{"role":"user","content":"hey"}}')).toBe("user: hey");
  });
});

describe("parseTranscriptLine edge cases", () => {
  it("returns null for invalid JSON or empty content", () => {
    expect(parseTranscriptLine("not json")).toBeNull();
    expect(parseTranscriptLine('{"payload":{"type":"agent_message","message":"   "}}')).toBeNull();
  });
});

describe("structured fields the legacy parser dropped", () => {
  it("captures the tool name on a function_call", () => {
    expect(parseTranscriptLine('{"payload":{"type":"function_call","name":"shell"}}')).toEqual({
      role: "tool",
      text: "shell",
      toolName: "shell"
    });
  });

  it("captures the embedded tool name on a claude assistant turn", () => {
    const entry = parseTranscriptLine(
      '{"message":{"role":"assistant","content":[{"type":"text","text":"done"},{"type":"tool_use","name":"Edit"}]}}'
    );
    expect(entry?.toolName).toBe("Edit");
    expect(entry?.text).toBe("done ⚙ Edit");
  });

  it("captures a timestamp when present", () => {
    const entry = parseTranscriptLine(
      '{"timestamp":"2026-06-14T10:00:00Z","payload":{"type":"agent_message","message":"hi"}}'
    );
    expect(entry?.timestamp).toBe("2026-06-14T10:00:00Z");
  });
});

describe("parseTranscript", () => {
  it("keeps the last N readable turns and skips blanks/noise", () => {
    const content = [
      '{"payload":{"type":"session_meta"}}',
      '{"payload":{"type":"user_message","message":"a"}}',
      "",
      '{"payload":{"type":"token_count"}}',
      '{"payload":{"type":"agent_message","message":"b"}}',
      '{"payload":{"type":"agent_message","message":"c"}}'
    ].join("\n");
    expect(toLines(parseTranscript(content, 2))).toEqual(["assistant: b", "assistant: c"]);
    expect(parseTranscript(content, 0)).toEqual([]);
    expect(parseTranscript(undefined, 10)).toEqual([]);
  });
});
