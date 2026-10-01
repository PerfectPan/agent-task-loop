import { inspect } from 'node:util';
import type { ArgsDef, CommandDef } from 'citty';

type Resolvable<T> = T | Promise<T> | (() => T) | (() => Promise<T>);

async function resolve<T>(value: Resolvable<T>): Promise<T> {
  return typeof value === 'function' ? (value as () => T | Promise<T>)() : value;
}

/**
 * Applies the CLI's argument and error rules to every leaf command of a citty
 * command tree.
 *
 * citty parses flags with node:util `parseArgs`, which never reads a value for
 * a boolean flag: `--force false` sets `force` to true and leaves `false` as a
 * positional argument. A leaf command therefore rejects positional arguments
 * it does not declare, so a value after a boolean flag fails instead of
 * silently turning the flag on.
 *
 * A failing command prints its error message, followed by the message of each
 * error in its `cause` chain that adds something, and exits with status 1;
 * citty's runMain would print the whole error object.
 */
export function withCommandGuards<T extends ArgsDef>(cmd: CommandDef<T>): CommandDef<T> {
  const { subCommands, run } = cmd;
  if (subCommands) {
    return {
      ...cmd,
      subCommands: async () => {
        const entries = Object.entries(await resolve(subCommands));
        return Object.fromEntries(
          await Promise.all(entries.map(async ([name, sub]) => [name, withCommandGuards(await resolve(sub))])),
        );
      },
    };
  }
  if (!run) {
    return cmd;
  }
  return {
    ...cmd,
    async run(context) {
      try {
        const argsDef: ArgsDef = await resolve(cmd.args ?? {});
        const declared = Object.values(argsDef).filter((arg) => arg.type === 'positional').length;
        const unexpected = context.args._.slice(declared);
        if (unexpected.length > 0) {
          throw new Error(unexpectedArgumentsMessage(unexpected));
        }
        return await run(context);
      } catch (error) {
        console.error(errorMessages(error));
        process.exit(1);
      }
    },
  };
}

function unexpectedArgumentsMessage(unexpected: string[]): string {
  const message = `Unexpected argument${unexpected.length > 1 ? 's' : ''}: ${unexpected.join(' ')}`;
  if (unexpected.some((value) => value === 'true' || value === 'false')) {
    return `${message}. Boolean flags take no value; turn one off with --no-<flag> or --<flag>=false.`;
  }
  return message;
}

function errorMessages(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const message = describe(current);
    // Some errors already end with their cause's message (execa's does), so a
    // cause the previous line contains adds nothing.
    if (!messages.at(-1)?.includes(message)) {
      messages.push(message);
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages.join('\n  caused by: ');
}

function describe(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return typeof value === 'string' ? value : inspect(value);
}
