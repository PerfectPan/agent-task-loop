import React from 'react';
import { defineCommand } from 'citty';
import { render } from 'ink';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import type { TargetAgent } from '../types/task';
import { TaskService } from '../services/task-service';
import { App } from '../tui/app';

export const tuiCommand = defineCommand({
  meta: {
    name: 'tui',
    description: 'Open task TUI',
  },
  args: {
    agent: {
      type: 'string',
      required: true,
    },
    config: {
      type: 'string',
    },
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertFeishuRuntimeConfig(config);
    const service = new TaskService(config);
    const tasks = await service.listPendingTasks(args.agent as TargetAgent);
    render(<App tasks={tasks} />);
  },
});
