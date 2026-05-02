import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';

export const syncCommand = defineCommand({
  meta: {
    name: 'sync',
    description: 'Validate local config',
  },
  args: {
    config: {
      type: 'string',
    },
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    console.log(`projects=${Object.keys(config.projects).length}`);
    console.log(`repositories=${Object.keys(config.repositories).length}`);
    console.log(`agents=${Object.keys(config.agents).length}`);
  },
});
