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
    description: 'Open interactive task dashboard',
  },
  args: {
    agent: {
      type: 'string',
      description: 'Filter tasks by agent (optional)',
      required: false,
    },
    config: {
      type: 'string',
    },
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertFeishuRuntimeConfig(config);
    const service = new TaskService(config);
    const agent = args.agent as TargetAgent | undefined;

    const onFetch = () =>
      agent ? service.listPendingTasks(agent) : service.listTasks();

    render(<App onFetch={onFetch} />);
  },
});
