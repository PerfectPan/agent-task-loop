import { defineCommand } from 'citty';
import { loadCommandConfig, taskCommandArgs } from './command-context';
import { printCommandOutput } from './command-output';

export const syncCommand = defineCommand({
  meta: {
    name: 'sync',
    description: 'Validate local config',
  },
  args: {
    ...taskCommandArgs,
  },
  async run({ args }) {
    const config = await loadCommandConfig(args);
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
