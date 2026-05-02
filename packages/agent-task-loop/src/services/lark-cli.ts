import { execa } from 'execa';
import { setTimeout as delay } from 'node:timers/promises';

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export async function runLarkCli(args: string[]): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const { stdout } = await execa('lark-cli', args, {
        env: process.env,
      });
      return stdout;
    } catch (error) {
      lastError = error;
      if (!isTransientLarkCliError(error) || attempt === RETRY_DELAYS_MS.length) {
        throw error;
      }
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

function isTransientLarkCliError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /TLS handshake timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network|timeout/i.test(message);
}
