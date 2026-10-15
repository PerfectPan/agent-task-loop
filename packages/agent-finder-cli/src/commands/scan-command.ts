import { defineCommand } from 'citty';
import { detectLocalAgents } from '../discovery/agents.js';
import { renderAgentTable, renderScanSummary } from '../formatters/agent-table.js';

export const scanCommand = defineCommand({
  meta: {
    name: 'scan',
    description: 'Scan local provider inventory',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print stable JSON',
    },
  },
  async run({ args }) {
    const installations = await detectLocalAgents();
    if (args.json) {
      console.log(JSON.stringify(installations, null, 2));
      return;
    }

    for (const line of renderAgentTable(installations)) {
      console.log(line);
    }
    console.log('');
    for (const line of renderScanSummary(installations)) {
      console.log(line);
    }
  },
});
