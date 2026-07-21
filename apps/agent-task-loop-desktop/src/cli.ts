#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createConfiguredLocalServer } from './server/configured.js';

const DEFAULT_PORT = 0;

async function serve(port: number, openBrowser: boolean): Promise<void> {
  const server = await createConfiguredLocalServer();
  const info = await server.listen(port);
  const baseUrl = `http://${info.host}:${info.port}`;

  process.stdout.write(
    [
      '',
      '  ATL Console  ·  local desktop',
      `  UI     ${baseUrl}/`,
      `  API    ${baseUrl}/v1`,
      `  Token  ${info.token}`,
      '',
      '  Endpoints: health · tasks · start · chat · events',
      '  Rivus tools: list · get · create · start',
      '',
    ].join('\n'),
  );

  if (openBrowser) {
    openUrl(baseUrl);
  }

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\nShutting down (${signal})...\n`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    process.stdout.write(`(could not open browser — visit ${url})\n`);
  }
}

const args = process.argv.slice(2);
const command = args[0];
const openBrowser = args.includes('--open') || args.includes('-o');
const portArg = args.find(a => /^\d+$/.test(a));
const port = portArg ? Number(portArg) : DEFAULT_PORT;

if (command === 'serve' || command === undefined) {
  serve(port, openBrowser || command === undefined).catch(error => {
    process.stderr.write(
      `Failed to start server: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
} else {
  process.stdout.write(
    [
      'Usage: agent-task-loop-desktop serve [port] [--open]',
      '',
      '  serve [port]   Start local API + UI on 127.0.0.1',
      '  --open / -o    Open the console in the default browser',
      '',
    ].join('\n'),
  );
}
