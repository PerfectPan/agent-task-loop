#!/usr/bin/env node
import { createConfiguredLocalServer } from './server/configured.js';

const DEFAULT_PORT = 0; // ephemeral — let the OS pick a free port

async function serve(port: number): Promise<void> {
  const server = await createConfiguredLocalServer();
  const info = await server.listen(port);

  const baseUrl = `http://${info.host}:${info.port}`;
  process.stdout.write(
    [
      'Agent Task Loop Desktop Console (headless)',
      `  Base URL: ${baseUrl}`,
      `  Token:    ${info.token}`,
      '',
      'Endpoints:',
      `  GET  ${baseUrl}/v1/health`,
      `  GET  ${baseUrl}/v1/tasks`,
      `  GET  ${baseUrl}/v1/tasks/:id`,
      `  POST ${baseUrl}/v1/tasks`,
      `  POST ${baseUrl}/v1/tasks/:id/start`,
      `  GET  ${baseUrl}/v1/events  (SSE)`,
      '',
      'All endpoints (except /v1/health) require: Authorization: Bearer <token>',
      '',
    ].join('\n'),
  );

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\nShutting down (${signal})...\n`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'serve') {
  const portArg = args.find(a => /^\d+$/.test(a));
  const port = portArg ? Number(portArg) : DEFAULT_PORT;
  serve(port).catch(error => {
    process.stderr.write(`Failed to start server: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
} else {
  process.stdout.write(
    [
      'Usage: agent-task-loop-desktop <command>',
      '',
      'Commands:',
      '  serve [port]   Start the headless local API server',
      '',
    ].join('\n'),
  );
}
