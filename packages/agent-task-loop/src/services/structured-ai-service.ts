import { execa } from 'execa';

export interface StructuredAiInput {
  /** Agent command (e.g. `config.agents.claude.command`). */
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Working directory for the agent process. */
  cwd: string;
  /** Stable session name so reruns reuse the same agent session. */
  sessionName: string;
  prompt: string;
  /** JSON Schema the model must satisfy (passed to `--json-schema`). */
  schema: Record<string, unknown>;
  timeoutMs?: number;
}

export interface StructuredAiResult<T> {
  data: T;
  sessionId?: string;
  sessionName: string;
}

/** Strips a wrapping ```json fence (if any) and trims. */
export function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/**
 * Parses a Claude `stream-json` transcript, returning the `structured_output`
 * payload and the session id. Throws on an `is_error` result or when no
 * structured output is found.
 */
export function extractClaudeStructured<T>(output: string): { data: T; sessionId?: string } {
  let sessionId: string | undefined;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const event = JSON.parse(line) as Record<string, any>;

    if (event.type === 'system' && event.subtype === 'init' && typeof event.session_id === 'string') {
      sessionId = event.session_id;
      continue;
    }

    if (event.type === 'result' && event.is_error) {
      const errorText = typeof event.result === 'string' ? event.result : 'claude structured generation failed';
      throw new Error(errorText);
    }

    if (event.type === 'result' && event.structured_output) {
      return { data: event.structured_output as T, sessionId };
    }
  }

  throw new Error(`Failed to parse structured Claude output: ${output}`);
}

/**
 * Runs a Claude agent in structured-output mode (`--json-schema`) and returns
 * the parsed result. Reusable across publish (commit/PR) and task-description
 * refinement.
 */
export async function runStructuredAi<T>(input: StructuredAiInput): Promise<StructuredAiResult<T>> {
  const result = await execa(
    input.command,
    [
      ...input.args,
      '-p',
      '-n',
      input.sessionName,
      '--output-format',
      'stream-json',
      '--verbose',
      '--json-schema',
      JSON.stringify(input.schema),
      '--tools',
      '',
      '--permission-mode',
      'bypassPermissions',
      input.prompt,
    ],
    {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      reject: false,
      all: true,
      stdin: 'ignore',
      timeout: input.timeoutMs ?? 120_000,
    },
  );

  if ((result.exitCode ?? 1) !== 0) {
    throw new Error(result.stderr || result.stdout || 'claude structured generation failed');
  }

  return {
    ...extractClaudeStructured<T>(result.all ?? result.stdout),
    sessionName: input.sessionName,
  };
}
