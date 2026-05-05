import type { RsbuildPlugin } from "@rsbuild/core";
import { syncMoonBitOutput } from "./sync-moonbit.js";

export function moonbitPlugin(): RsbuildPlugin {
  return {
    name: "moonbit-plugin",
    setup(api) {
      api.onBeforeBuild(() => {
        syncMoonBitOutput(api.context.rootPath);
      });
    }
  };
}
