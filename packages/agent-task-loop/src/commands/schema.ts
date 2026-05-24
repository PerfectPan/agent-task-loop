import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import { TaskTableSchemaService } from '../services/schema-service';
import { printCommandOutput } from './command-output';

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
    const textLines = [`existing=${result.existing.length}`, `missing=${result.missing.length}`];

    if (result.missing.length > 0) {
      textLines.push(`missingFields=${result.missing.join(',')}`);
    }

    let jsonValue: unknown = result;
    if (args.apply) {
      const applied = await service.applyMissingFields();
      jsonValue = {
        existing: result.existing,
        missing: result.missing,
        created: applied.created,
        updated: applied.updated,
      };
      textLines.push(`created=${applied.created.length}`);
      if (applied.created.length > 0) {
        textLines.push(`createdFields=${applied.created.join(',')}`);
      }
      textLines.push(`updated=${applied.updated.length}`);
      if (applied.updated.length > 0) {
        textLines.push(`updatedFields=${applied.updated.join(',')}`);
      }
    }

    printCommandOutput({
      json: Boolean(args.json),
      jsonValue,
      textLines,
    });
  },
});
