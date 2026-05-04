import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const packageRoot = join(process.cwd(), "agent_discovery_core");
const sourceRoot = join(process.cwd(), "src");

describe("MoonBit discovery core structure", () => {
  test("uses domain packages instead of a flat function list", () => {
    for (const path of [
      "model/moon.pkg",
      "catalog/moon.pkg",
      "scanner/moon.pkg",
      "diagnostics/moon.pkg",
      "js_abi.mbt"
    ]) {
      expect(existsSync(join(packageRoot, path)), path).toBe(true);
    }
    expect(existsSync(join(packageRoot, "bridge/moon.pkg")), "bridge package").toBe(false);
    expect(existsSync(join(packageRoot, "js_exports.mbt")), "facade file").toBe(false);
  });

  test("keeps generated MoonBit access behind one TypeScript adapter", () => {
    expect(existsSync(join(sourceRoot, "moonbit-api.ts"))).toBe(true);

    for (const path of [
      "discover.ts",
      "list-command-candidates.ts",
      "list-path-candidates.ts",
      "list-providers.ts"
    ]) {
      const source = readFileSync(join(sourceRoot, path), "utf8");

      expect(source).not.toContain("./moonbit/agent_discovery_core.js");
      expect(source).not.toContain("JSON.parse");
    }
  });
});
