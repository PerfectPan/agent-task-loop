import { createOrchestration } from './node-factory';

export interface CliIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
}

export function runOrchCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: CliIo = process,
): number {
  try {
    const parsed = parseArgs(argv);
    const runKey = requireEnv(env, 'ORCH_RUN');
    const seat = requireEnv(env, 'ORCH_SEAT');
    if (parsed.run !== undefined && parsed.run !== runKey) {
      throw new Error(`--run ${parsed.run} does not match ORCH_RUN`);
    }
    if (parsed.seat !== undefined && parsed.seat !== seat) {
      throw new Error(`--seat ${parsed.seat} does not match ORCH_SEAT`);
    }
    const orch = createOrchestration({ dbPath: env.ORCH_DB });
    try {
      if (parsed.command === 'pull') {
        const entries = orch.inbox({ key: runKey, seat });
        io.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
        if (entries.length > 0) {
          orch.inbox({ key: runKey, seat, markRead: true });
        }
        return 0;
      }
      if (parsed.command === 'send') {
        if (!parsed.to || parsed.body === undefined) {
          throw new Error('usage: orch send <seat> <text> [--kind note]');
        }
        const to = parsed.to === '*' || parsed.to === '-' ? null : parsed.to;
        const entry = orch.send({
          key: runKey,
          from: seat,
          to,
          mailKind: parsed.kind ?? 'note',
          body: parsed.body,
        });
        io.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
        return 0;
      }
      if (parsed.command === 'log') {
        const page = orch.channel({ key: runKey, fromIndex: parsed.from ?? 1 });
        io.stdout.write(`${JSON.stringify(page, null, 2)}\n`);
        return 0;
      }
      throw new Error('usage: orch <pull|send|log>');
    } finally {
      if ('close' in orch && typeof orch.close === 'function') {
        orch.close();
      }
    }
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseArgs(argv: string[]): {
  command?: string;
  to?: string;
  body?: string;
  kind?: string;
  from?: number;
  run?: string;
  seat?: string;
} {
  const args = [...argv];
  const flags: { kind?: string; from?: number; run?: string; seat?: string } = {};
  const positional: string[] = [];
  while (args.length > 0) {
    const token = args.shift()!;
    if (token === '--kind') {
      flags.kind = args.shift();
      continue;
    }
    if (token === '--from') {
      flags.from = Number(args.shift());
      continue;
    }
    if (token === '--run') {
      flags.run = args.shift();
      continue;
    }
    if (token === '--seat') {
      flags.seat = args.shift();
      continue;
    }
    if (token.startsWith('--')) {
      throw new Error(`unknown flag ${token}`);
    }
    positional.push(token);
  }
  const [command, to, ...rest] = positional;
  return {
    command,
    to,
    body: rest.length > 0 ? rest.join(' ') : undefined,
    ...flags,
  };
}

function main(): void {
  process.exitCode = runOrchCli(process.argv.slice(2));
}

const invoked = process.argv[1]?.includes('orch') || process.argv[1]?.includes('cli');
if (invoked) {
  main();
}
