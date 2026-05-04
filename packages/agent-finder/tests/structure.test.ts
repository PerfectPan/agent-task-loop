import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const packageRoot = join(process.cwd(), "agent_discovery_core");

describe("MoonBit discovery core structure", () => {
  test("uses domain packages instead of a flat function list", () => {
    for (const path of [
      "model/moon.pkg",
      "catalog/moon.pkg",
      "scanner/moon.pkg",
      "diagnostics/moon.pkg",
      "bridge/moon.pkg"
    ]) {
      expect(existsSync(join(packageRoot, path)), path).toBe(true);
    }
  });
});
