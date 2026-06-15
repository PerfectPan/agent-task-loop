import { defineCommand } from "citty";
import { listProviders, type ProviderSpec } from "@rivus/agent-finder-core";
import { renderTable, style, type Column } from "../formatters/render.js";

const COLUMNS: Column<ProviderSpec>[] = [
  { header: "ID", get: (p) => p.id, color: () => style.bold },
  { header: "Name", get: (p) => p.displayName },
  { header: "Adapter", get: (p) => p.adapterMode, color: () => style.dim }
];

export const providerListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List supported provider IDs and display names"
  },
  run() {
    const providers = [...listProviders()].sort((a, b) => a.id.localeCompare(b.id));
    for (const line of renderTable(COLUMNS, providers)) {
      console.log(line);
    }
  }
});
