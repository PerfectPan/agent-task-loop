#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { cleanupCommand } from './commands/cleanup';
import { createCommand } from './commands/create';
import { initCommand } from './commands/init';
import { completeCommand } from './commands/complete';
import { rejectCommand } from './commands/reject';
import { runCommand } from './commands/run';
import { schemaCommand } from './commands/schema';
import { sourceCommand } from './commands/source';
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
    create: createCommand,
    init: initCommand,
    complete: completeCommand,
    reject: rejectCommand,
    start: startCommand,
    run: runCommand,
    resume: resumeCommand,
    schema: schemaCommand,
    source: sourceCommand,
    sync: syncCommand,
    tui: tuiCommand,
    watch: watchCommand,
  },
});

runMain(main);
