import { describe, expect, test } from "vitest";
import { resolveCommand } from "../src/index";

describe("@rivus/agent-finder-core resolveCommand", () => {
  test("resolves Windows commands using PATHEXT without shelling", () => {
    const result = resolveCommand("code", {
      path: "C:\\Program Files\\Microsoft VS Code\\bin;C:\\Windows\\System32",
      pathExt: ".COM;.EXE;.BAT;.CMD",
      delimiter: ";",
      fileExists: (candidate) =>
        candidate === "C:\\Program Files\\Microsoft VS Code\\bin\\code.CMD"
    });

    expect(result).toBe("C:\\Program Files\\Microsoft VS Code\\bin\\code.CMD");
  });
});
