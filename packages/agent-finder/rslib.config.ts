import { defineConfig } from "@rslib/core";
import { libConfig } from "@rivus/rslib-config/lib.config";
import { moonbitPlugin } from "@rivus/rslib-config/moonbit-plugin";

export default defineConfig({
  ...libConfig,
  source: { entry: { index: "src/index.ts" } },
  plugins: [moonbitPlugin()]
});
