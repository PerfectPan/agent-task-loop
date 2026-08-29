import { defineConfig } from "@rslib/core";
import { cliConfig } from "@rivus/rslib-config/cli.config";

export default defineConfig({
  ...cliConfig,
  lib: [
    {
      format: "esm",
      dts: { abortOnError: false, bundle: true },
      bundle: true
    }
  ],
  source: {
    entry: {
      cli: "src/cli.ts",
      "rivus-plugin": "src/rivus-plugin.ts",
      "task-manager": "src/task-manager/index.ts"
    }
  },
  tools: {
    rspack: {
      externals: ["react-devtools-core"]
    }
  }
});
