import React from 'react';
import { defineCommand } from 'citty';
import { render } from 'ink';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import type { TargetAgent } from '../types/task';
import { TaskService } from '../services/task-service';
import { App } from '../tui/components/App';
import { FsSessionProvider } from '../tui/data/fs-session-provider';

const ENTER_ALT_SCREEN = '[?1049h';
const LEAVE_ALT_SCREEN = '[?1049l';

export const tuiCommand = defineCommand({
  meta: {
    name: 'tui',
    description: 'Open the interactive task + session dashboard',
  },
  args: {
    agent: {
      type: 'string',
      description: 'Only show tasks pending for this agent (claude|codex|coco|glm)',
    },
    config: {
      type: 'string',
    },
  },
  async run({ args }) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('The tui command requires an interactive terminal (TTY).');
      process.exitCode = 1;
      return;
    }

    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertFeishuRuntimeConfig(config);
    const service = new TaskService(config);
    const agent = typeof args.agent === 'string' ? (args.agent as TargetAgent) : undefined;

    // Take over the whole terminal (alternate screen buffer), restoring the
    // user's scrollback on exit — the dashboard runs full-screen.
    process.stdout.write(ENTER_ALT_SCREEN);
    const restore = () => process.stdout.write(LEAVE_ALT_SCREEN);
    process.once('exit', restore);

    const instance = render(
      <App
        agent={agent ?? 'all'}
        onFetchTasks={() => (agent ? service.listPendingTasks(agent) : service.listTasks())}
        sessionProvider={new FsSessionProvider()}
        onCreateTask={payload => service.createTask(payload)}
      />,
    );

    try {
      await instance.waitUntilExit();
    } finally {
      process.off('exit', restore);
      restore();
    }
  },
});
