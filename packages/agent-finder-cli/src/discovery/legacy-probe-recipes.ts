import type { CodingAgentId } from '@rivus/agent-kit/catalog';
import { versionFromOutput, type ProbeRecipe } from '@rivus/agent-kit/discovery';

/**
 * Probe recipes for the 20 agents the MoonBit catalog listed beyond the 7 the kit supports. Each is a field-for-field
 * port of one spec in the deleted `agent_discovery_core/catalog/providers.mbt`: `id`→`agent`, `display_name`→
 * `displayName`, `kind`→`kind`, `commands`→`commands`, `config_paths`→`configPaths`, `app_paths`→`appPaths`,
 * `mcp_paths`→`mcpConfigPaths`, the cli constructor's `--version` probe→`version`, and `warnings` verbatim.
 * No agent carries an auth probe, because the MoonBit scanner had none.
 */

/** `<command> --version`, the only version probe the MoonBit catalog ever ran, read with the kit's default parser. */
const CLI_VERSION_PROBE = {
  args: ['--version'],
  parse: versionFromOutput,
  sideEffects: [],
} as const;

function cli(
  agent: CodingAgentId,
  displayName: string,
  commands: readonly string[],
  configPaths: readonly string[],
  appPaths: readonly string[],
  mcpConfigPaths: readonly string[],
  warnings: readonly string[],
): ProbeRecipe {
  return {
    specificationVersion: 'discovery-v1',
    agent,
    displayName,
    kind: 'cli',
    commands,
    appPaths,
    configPaths,
    mcpConfigPaths,
    version: CLI_VERSION_PROBE,
    warnings,
  };
}

function app(
  agent: CodingAgentId,
  displayName: string,
  commands: readonly string[],
  configPaths: readonly string[],
  appPaths: readonly string[],
  mcpConfigPaths: readonly string[],
  warnings: readonly string[],
): ProbeRecipe {
  return {
    specificationVersion: 'discovery-v1',
    agent,
    displayName,
    kind: 'app',
    commands,
    appPaths,
    configPaths,
    mcpConfigPaths,
    warnings,
  };
}

function extension(
  agent: CodingAgentId,
  displayName: string,
  commands: readonly string[],
  configPaths: readonly string[],
  appPaths: readonly string[],
  mcpConfigPaths: readonly string[],
  warnings: readonly string[],
): ProbeRecipe {
  return {
    specificationVersion: 'discovery-v1',
    agent,
    displayName,
    kind: 'extension',
    commands,
    appPaths,
    configPaths,
    mcpConfigPaths,
    warnings,
  };
}

/** The MoonBit catalog's agents in catalog order, minus the six the kit detects with its own built-in recipes. */
export const legacyProbeRecipes: Readonly<Record<string, ProbeRecipe>> = {
  openhands: app(
    'openhands',
    'OpenHands',
    ['openhands'],
    ['~/.openhands'],
    [],
    [],
    ['OpenHands may be local, containerized, or remote; discovery is conservative.'],
  ),
  cline: extension(
    'cline',
    'Cline',
    [],
    ['~/.vscode/extensions'],
    [],
    [],
    ['Cline extension presence is not validated without reading extension metadata.'],
  ),
  codebuddy: cli(
    'codebuddy',
    'CodeBuddy',
    ['codebuddy'],
    ['~/.codebuddy'],
    [],
    [],
    ['CodeBuddy command and config paths may vary by distribution.'],
  ),
  'command-code': cli(
    'command-code',
    'Command Code',
    ['command-code'],
    ['~/.command-code'],
    [],
    [],
    ['Command Code provider metadata needs validation.'],
  ),
  'kiro-cli': cli(
    'kiro-cli',
    'Kiro CLI',
    ['kiro'],
    ['~/.kiro'],
    [],
    [],
    ['Kiro CLI provider metadata needs validation.'],
  ),
  antigravity: app(
    'antigravity',
    'Antigravity',
    ['antigravity'],
    ['~/.antigravity'],
    [],
    [],
    ['Antigravity provider metadata needs validation.'],
  ),
  'roo-code': extension(
    'roo-code',
    'Roo Code',
    [],
    ['~/.vscode/extensions'],
    [],
    [],
    ['Roo Code extension presence is not validated without reading extension metadata.'],
  ),
  'github-copilot': cli(
    'github-copilot',
    'GitHub Copilot',
    ['gh', 'copilot'],
    ['~/.config/gh'],
    [],
    [],
    ['GitHub Copilot CLI support is detected conservatively through command metadata.'],
  ),
  amp: cli('amp', 'Amp', ['amp'], ['~/.amp'], [], [], ['Amp provider metadata needs validation.']),
  openclaw: cli(
    'openclaw',
    'OpenClaw',
    ['openclaw'],
    ['~/.openclaw'],
    [],
    [],
    ['OpenClaw provider metadata needs validation.'],
  ),
  neovate: cli(
    'neovate',
    'Neovate',
    ['neovate'],
    ['~/.neovate'],
    [],
    [],
    ['Neovate provider metadata needs validation.'],
  ),
  qoder: cli('qoder', 'Qoder', ['qoder'], ['~/.qoder'], [], [], ['Qoder provider metadata needs validation.']),
  zencoder: cli(
    'zencoder',
    'Zencoder',
    ['zencoder'],
    ['~/.zencoder'],
    [],
    [],
    ['Zencoder provider metadata needs validation.'],
  ),
  'kimi-code-cli': cli(
    'kimi-code-cli',
    'Kimi Code CLI',
    ['kimi'],
    ['~/.kimi'],
    [],
    [],
    ['Kimi Code CLI provider metadata needs validation.'],
  ),
  windsurf: app(
    'windsurf',
    'Windsurf',
    ['windsurf'],
    ['~/Library/Application Support/Windsurf/User', '~/.config/Windsurf/User', '~/.codeium'],
    ['/Applications/Windsurf.app'],
    ['~/.codeium/windsurf/mcp_config.json', '~/Library/Application Support/Windsurf/User/mcp.json'],
    [],
  ),
  'vscode-copilot': extension(
    'vscode-copilot',
    'VS Code Copilot',
    ['code'],
    ['~/Library/Application Support/Code/User', '~/.config/Code/User', '~/AppData/Roaming/Code/User'],
    [],
    ['~/Library/Application Support/Code/User/mcp.json'],
    ['VS Code Copilot extension presence is not validated without reading extension metadata.'],
  ),
  'codex-desktop': app(
    'codex-desktop',
    'Codex Desktop',
    [],
    ['~/.codex'],
    ['/Applications/Codex.app'],
    ['~/.codex/config.toml'],
    [],
  ),
  aider: cli('aider', 'aider', ['aider'], ['~/.aider.conf.yml', '~/.config/aider'], [], [], []),
  hermes: cli('hermes', 'Hermes', ['hermes'], ['~/.hermes'], [], [], ['Hermes provider metadata needs validation.']),
  trae: cli('trae', 'Trae', ['trae'], ['~/.trae'], [], [], ['Trae provider metadata needs validation.']),
};
