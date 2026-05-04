import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(
  packageRoot,
  "_build",
  "js",
  "debug",
  "build",
  "agent_discovery_core"
);
const targetDir = join(packageRoot, "src", "moonbit");

mkdirSync(targetDir, { recursive: true });

for (const file of [
  "agent_discovery_core.js",
  "agent_discovery_core.js.map",
  "agent_discovery_core.d.ts",
  "moonbit.d.ts"
]) {
  copyFileSync(join(sourceDir, file), join(targetDir, file));
}
