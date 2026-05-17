import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { printJson } from './json-output';

export const syncCommand = defineCommand({
  meta: {
    name: 'sync',
    description: 'Validate local config',
  },
  args: {
    config: {
      type: 'string',
    },
    json: {
      type: 'boolean',
      default: false,
    },
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    const result = {
      projects: Object.keys(config.projects).length,
      repositories: Object.keys(config.repositories).length,
      agents: Object.keys(config.agents).length,
    };

    if (args.json) {
      printJson(result);
      return;
    }

    console.log(`projects=${result.projects}`);
    console.log(`repositories=${result.repositories}`);
    console.log(`agents=${result.agents}`);
  },
});
