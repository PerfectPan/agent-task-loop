import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkSchemaSpy = vi.fn();
const applyMissingFieldsSpy = vi.fn();
const schemaServiceCtor = vi.fn();

const loadConfigMock = vi.fn();

vi.mock('../../src/config/load-config', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('../../src/config/runtime-guard', () => ({
  assertRuntimeConfig: vi.fn(),
}));

vi.mock('../../src/services/schema-service', () => ({
  TaskTableSchemaService: schemaServiceCtor.mockImplementation(() => ({
    checkSchema: checkSchemaSpy,
    applyMissingFields: applyMissingFieldsSpy,
  })),
}));

const feishuConfig = {
  feishu: { baseToken: 'base', tableId: 'table' },
  projects: {},
  repositories: {},
  agents: {},
};

const githubOnlyConfig = {
  githubIssues: { owner: 'o', repo: 'r' },
  projects: {},
  repositories: {},
  agents: {},
};

describe('schemaCommand', () => {
  beforeEach(() => {
    loadConfigMock.mockReset();
    loadConfigMock.mockResolvedValue(feishuConfig);
    schemaServiceCtor.mockClear();
    checkSchemaSpy.mockReset();
    checkSchemaSpy.mockResolvedValue({ existing: ['TaskID', 'Title'], missing: ['Status'] });
    applyMissingFieldsSpy.mockReset();
    applyMissingFieldsSpy.mockResolvedValue({ created: ['Status'], updated: ['TargetAgent'] });
  });

  it('prints schema check and apply result as json when requested', async () => {
    const { schemaCommand } = await import('../../src/commands/schema');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await schemaCommand.run?.({
      args: { config: 'cfg.json', apply: true, json: true },
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

  it('prints a notice and skips the schema service when no Feishu source', async () => {
    loadConfigMock.mockResolvedValue(githubOnlyConfig);
    const { schemaCommand } = await import('../../src/commands/schema');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await schemaCommand.run?.({ args: { config: 'cfg.json', json: false } } as never);

    expect(schemaServiceCtor).not.toHaveBeenCalled();
    const printed = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(printed).toContain('No Feishu source configured');
    logSpy.mockRestore();
  });
});
