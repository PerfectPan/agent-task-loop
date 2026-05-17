import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import { TaskTableSchemaService } from '../services/schema-service';
import { printJson } from './json-output';

export const schemaCommand = defineCommand({
  meta: {
    name: 'schema',
    description: 'Check or initialize Feishu task table schema',
  },
  args: {
    config: {
      type: 'string',
    },
    apply: {
      type: 'boolean',
      default: false,
    },
    json: {
      type: 'boolean',
      default: false,
    },
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertFeishuRuntimeConfig(config);
    const service = new TaskTableSchemaService(config);
    const result = await service.checkSchema();

    if (args.json) {
      if (args.apply) {
        const applied = await service.applyMissingFields();
        printJson({
          existing: result.existing,
          missing: result.missing,
          created: applied.created,
          updated: applied.updated,
        });
        return;
      }

      printJson(result);
      return;
    }

    console.log(`existing=${result.existing.length}`);
    console.log(`missing=${result.missing.length}`);

    if (result.missing.length > 0) {
      console.log(`missingFields=${result.missing.join(',')}`);
    }

    if (args.apply) {
      const applied = await service.applyMissingFields();
      console.log(`created=${applied.created.length}`);
      if (applied.created.length > 0) {
        console.log(`createdFields=${applied.created.join(',')}`);
      }
      console.log(`updated=${applied.updated.length}`);
      if (applied.updated.length > 0) {
        console.log(`updatedFields=${applied.updated.join(',')}`);
      }
    }
  },
});
