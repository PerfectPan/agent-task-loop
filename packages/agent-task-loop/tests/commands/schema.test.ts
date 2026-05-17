import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkSchemaSpy = vi.fn();
const applyMissingFieldsSpy = vi.fn();

vi.mock('../../src/config/load-config', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    feishu: { baseToken: 'base', tableId: 'table' },
    projects: {},
    repositories: {},
    agents: {},
  }),
}));

vi.mock('../../src/config/runtime-guard', () => ({
  assertFeishuRuntimeConfig: vi.fn(),
}));

vi.mock('../../src/services/schema-service', () => ({
  TaskTableSchemaService: vi.fn().mockImplementation(() => ({
    checkSchema: checkSchemaSpy,
    applyMissingFields: applyMissingFieldsSpy,
  })),
}));

describe('schemaCommand', () => {
  beforeEach(() => {
    checkSchemaSpy.mockReset();
    checkSchemaSpy.mockResolvedValue({
      existing: ['TaskID', 'Title'],
      missing: ['Status'],
    });
    applyMissingFieldsSpy.mockReset();
    applyMissingFieldsSpy.mockResolvedValue({
      created: ['Status'],
      updated: ['TargetAgent'],
    });
  });

  it('prints schema check and apply result as json when requested', async () => {
    const { schemaCommand } = await import('../../src/commands/schema');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await schemaCommand.run?.({
      args: {
        config: 'task.config.ts',
        apply: true,
        json: true,
      },
    } as never);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual({
      existing: ['TaskID', 'Title'],
      missing: ['Status'],
      created: ['Status'],
      updated: ['TargetAgent'],
    });
    logSpy.mockRestore();
  });
});
