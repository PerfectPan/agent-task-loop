const config = {
  feishu: {
    baseToken: 'demo_base_token',
    tableId: 'tbl_demo_tasks',
  },
  projects: {
    demo: {
      key: 'demo',
      name: 'Demo',
      defaultRepository: 'demo_app',
      workspaceRoot: '/workspace/demo-worktrees',
      deployProfile: 'staging',
      taskTemplatePrompt: '请按仓库内 AGENTS.md 执行任务。',
    },
  },
  repositories: {
    demo_app: {
      key: 'demo_app',
      localPath: '/workspace/demo-app',
      defaultBranch: 'main',
      installCommand: 'pnpm install',
      testCommand: 'pnpm test',
      buildCommand: 'pnpm build',
      deployCommand: 'pnpm deploy:small',
      workspaceStrategy: 'worktree',
    },
  },
  agents: {
    claude: { name: 'claude', command: 'claude', args: [], env: {} },
    codex: { name: 'codex', command: 'codex', args: [], env: {} },
    coco: { name: 'coco', command: 'coco', args: [], env: {} },
    glm: { name: 'glm', command: 'glm', args: [], env: {} },
  },
};

export default config;
