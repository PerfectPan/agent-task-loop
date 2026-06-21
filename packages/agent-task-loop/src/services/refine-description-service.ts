import type { AppConfig } from '../config/schema';
import { buildRefineDescriptionPrompt } from './refine-prompt-service';
import { runStructuredAi, stripCodeFences } from './structured-ai-service';

const refineDescriptionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    description: { type: 'string' },
  },
  required: ['description'],
} as const;

export interface RefineDescriptionDeps {
  /** Injectable for tests; defaults to the real {@link runStructuredAi}. */
  runStructuredAi?: typeof runStructuredAi;
}

/**
 * Uses the configured `claude` agent to refine a task description. Requires a
 * `claude` agent in config; throws a clear error otherwise. Returns the refined
 * description with any wrapping code fences stripped.
 */
export async function refineDescription(
  config: AppConfig,
  input: { title: string; description: string },
  deps: RefineDescriptionDeps = {},
): Promise<string> {
  const agent = config.agents.claude;
  if (!agent) {
    throw new Error('AI refine needs a configured `claude` agent');
  }
  const run = deps.runStructuredAi ?? runStructuredAi;
  const result = await run<{ description: string }>({
    command: agent.command,
    args: agent.args,
    env: agent.env,
    cwd: process.cwd(),
    sessionName: 'refine-description-claude',
    prompt: buildRefineDescriptionPrompt(input),
    schema: refineDescriptionSchema,
  });
  return stripCodeFences(result.data.description);
}
