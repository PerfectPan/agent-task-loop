import { builtinCodingAgents, isBuiltinCodingAgentId } from '@rivus/agent-kit/catalog';
import {
  builtinProbeRecipes,
  detectAgents,
  type DetectAgentsOptions,
  type Installation,
  type ProbePath,
  type ProbeRecipe,
  type ProbeRecipes,
} from '@rivus/agent-kit/discovery';
import { createNodePlatform } from '@rivus/agent-kit/node';
import { legacyProbeRecipes } from './legacy-probe-recipes.js';

/**
 * The kit's built-in recipes plus the MoonBit catalog's remaining agents. `detectAgents` reports the built-ins in
 * their table order first, then the legacy ones; the MoonBit scanner used the catalog file order instead.
 */
export const allProbeRecipes: ProbeRecipes = { ...builtinProbeRecipes, ...legacyProbeRecipes };

/** Runs `detectAgents` against this machine with the full recipe table. */
export async function detectLocalAgents(options: DetectAgentsOptions = {}): Promise<Installation[]> {
  return detectAgents(createNodePlatform(), { recipes: allProbeRecipes, ...options });
}

/** Provider metadata as the `provider` commands display it; the shape the MoonBit catalog used to export. */
export interface ProviderSpec {
  id: string;
  displayName: string;
  kind: string;
  adapterMode: string;
  commandCandidates: string[];
  appPathCandidates: string[];
  configPathCandidates: string[];
  mcpConfigPathCandidates: string[];
  versionProbe: string | null;
  warnings: string[];
}

function adapterModeOf(recipe: ProbeRecipe): string {
  if (recipe.kind === 'extension') {
    return 'extension';
  }
  if (recipe.kind === 'app') {
    return 'app-only';
  }
  return recipe.version ? 'versioned-cli' : 'unversioned-cli';
}

/**
 * Renders a recipe path for display: a plain path as-is, a path under an agent's home as the kit documents it —
 * written as the home rule's default under `~`, such as `~/.codex`.
 */
function describeProbePath(path: ProbePath): string {
  if (typeof path === 'string') {
    return path;
  }
  const agent = isBuiltinCodingAgentId(path.agentHome) ? builtinCodingAgents[path.agentHome] : undefined;
  const home = agent && 'home' in agent ? agent.home : undefined;
  const base = home ? `~/${home.defaultPath.join('/')}` : '~';
  return path.path === undefined ? base : `${base}/${path.path}`;
}

function toProviderSpec(recipe: ProbeRecipe): ProviderSpec {
  return {
    id: recipe.agent,
    displayName: recipe.displayName,
    kind: recipe.kind,
    adapterMode: adapterModeOf(recipe),
    commandCandidates: [...recipe.commands],
    appPathCandidates: recipe.appPaths.map(describeProbePath),
    configPathCandidates: recipe.configPaths.map(describeProbePath),
    mcpConfigPathCandidates: recipe.mcpConfigPaths.map(describeProbePath),
    versionProbe: recipe.version ? recipe.version.args.join(' ') : null,
    warnings: [...recipe.warnings],
  };
}

/** Every provider the full recipe table covers, in detection order. */
export function listProviders(): ProviderSpec[] {
  return Object.values(allProbeRecipes)
    .filter((recipe): recipe is ProbeRecipe => recipe !== undefined)
    .map(toProviderSpec);
}

/** The provider metadata of one agent id, or null when no recipe covers it. */
export function inspectProvider(id: string): ProviderSpec | null {
  const recipe = Object.hasOwn(allProbeRecipes, id) ? allProbeRecipes[id] : undefined;
  return recipe ? toProviderSpec(recipe) : null;
}
