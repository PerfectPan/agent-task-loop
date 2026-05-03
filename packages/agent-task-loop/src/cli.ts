#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { cleanupCommand } from './commands/cleanup';
import { completeCommand } from './commands/complete';
import { rejectCommand } from './commands/reject';
import { runCommand } from './commands/run';
import { schemaCommand } from './commands/schema';
import { startCommand } from './commands/start';
import { resumeCommand } from './commands/resume';
import { syncCommand } from './commands/sync';
import { tuiCommand } from './commands/tui';
import { watchCommand } from './commands/watch';
import { getPackageVersion } from './package-info';

const main = defineCommand({
  meta: {
    name: 'agent-task-loop',
    version: getPackageVersion(),
    description: 'Agent task delivery loop CLI',
  },
  subCommands: {
    cleanup: cleanupCommand,
    complete: completeCommand,
    reject: rejectCommand,
    start: startCommand,
    run: runCommand,
    resume: resumeCommand,
    schema: schemaCommand,
    sync: syncCommand,
    tui: tuiCommand,
    watch: watchCommand,
  },
});

runMain(main);
