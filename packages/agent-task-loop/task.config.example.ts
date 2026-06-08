const config = {
  feishu: {
    baseToken: 'demo_base_token',
    tableId: 'tbl_demo_tasks',
  },
  // Optional secondary source. When present, the loop and TUI read tasks from
  // Feishu *and* GitHub Issues; each task's writes are routed back to its owning
  // backend. The TUI is an integration layer — it never owns tasks itself.
  // githubIssues: {
  //   owner: 'your-org',
  //   repo: 'your-repo',
  //   token: process.env.GITHUB_TOKEN, // or omit to use the GITHUB_TOKEN env var
  //   defaultAgent: 'codex',
  // },
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
