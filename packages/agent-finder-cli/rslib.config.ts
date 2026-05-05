import { defineConfig } from "@rslib/core";
import { cliConfig } from "@rivus/rslib-config/cli.config";

export default defineConfig({
  ...cliConfig,
  lib: [
    {
      format: "esm",
      dts: { abortOnError: false },
      bundle: true
    }
  ],
  source: { entry: { cli: "src/cli.ts" } }
});
