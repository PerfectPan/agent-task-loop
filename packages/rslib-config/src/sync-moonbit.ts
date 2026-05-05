import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function syncMoonBitOutput(cwd: string) {
  execSync("moon build --target js", { cwd, stdio: "inherit" });

  const src = join(cwd, "_build", "js", "debug", "build", "agent_discovery_core");
  const dst = join(cwd, "src", "moonbit");
  mkdirSync(dst, { recursive: true });

  for (const file of [
    "agent_discovery_core.js",
    "agent_discovery_core.js.map",
    "agent_discovery_core.d.ts",
    "moonbit.d.ts"
  ]) {
    copyFileSync(join(src, file), join(dst, file));
  }
}
