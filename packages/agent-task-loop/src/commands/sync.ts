import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { printCommandOutput } from './command-output';

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

    printCommandOutput({
      json: Boolean(args.json),
      jsonValue: result,
      textLines: [`projects=${result.projects}`, `repositories=${result.repositories}`, `agents=${result.agents}`],
    });
  },
});
