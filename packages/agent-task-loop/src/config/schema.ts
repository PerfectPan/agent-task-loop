import { z } from 'zod';

export const agentConfigSchema = z.object({
  name: z.enum(['claude', 'codex', 'coco', 'glm']),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
});

export const repositoryConfigSchema = z.object({
  key: z.string().min(1),
  localPath: z.string().min(1),
  defaultBranch: z.string().min(1),
  installCommand: z.string().min(1),
  testCommand: z.string().min(1),
  buildCommand: z.string().min(1),
  deployCommand: z.string().optional(),
  workspaceStrategy: z.enum(['existing-repo', 'worktree']),
});

export const projectConfigSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  defaultRepository: z.string().min(1),
  workspaceRoot: z.string().min(1),
  deployProfile: z.string().optional(),
  taskTemplatePrompt: z.string().default(''),
});

export const githubRepoConfigSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  /** Per-repo override of the issues source's `defaultAgent`. */
  defaultAgent: z.enum(['claude', 'codex', 'coco', 'glm']).optional(),
});

export const githubIssuesConfigSchema = z
  .object({
    /** Single-repo shorthand: `owner` + `repo`. Use `repositories` for several. */
    owner: z.string().min(1).optional(),
    repo: z.string().min(1).optional(),
    /** Several repos. Each becomes its own `github:<owner>/<repo>` task source. */
    repositories: z.array(githubRepoConfigSchema).optional(),
    /** Personal access token; falls back to GITHUB_TOKEN, then `gh auth token`. */
    token: z.string().optional(),
    /** Agent assigned to issues that carry no `agent:<name>` label. */
    defaultAgent: z.enum(['claude', 'codex', 'coco', 'glm']).default('codex'),
  })
  .superRefine((cfg, ctx) => {
    const hasSingle = Boolean(cfg.owner) && Boolean(cfg.repo);
    const hasMulti = Boolean(cfg.repositories && cfg.repositories.length > 0);
    if (!hasSingle && !hasMulti) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'githubIssues needs either owner+repo or a non-empty repositories[]',
      });
    }
  });

export type GitHubRepoConfig = z.infer<typeof githubRepoConfigSchema>;

export const feishuConfigSchema = z.object({
  baseToken: z.string().min(1),
  tableId: z.string().min(1),
  viewId: z.string().optional(),
});

export const appConfigSchema = z
  .object({
    /** Optional task source. Configure at least one of `feishu` / `githubIssues`. */
    feishu: feishuConfigSchema.optional(),
    /** Optional task source. When present alongside feishu, tasks are read from both. */
    githubIssues: githubIssuesConfigSchema.optional(),
    projects: z.record(projectConfigSchema),
    repositories: z.record(repositoryConfigSchema),
    agents: z.record(agentConfigSchema),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.feishu && !cfg.githubIssues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'configure at least one task source: feishu or githubIssues',
      });
    }
  });

export type FeishuConfig = z.infer<typeof feishuConfigSchema>;

export type GitHubIssuesConfig = z.infer<typeof githubIssuesConfigSchema>;

export type AppConfig = z.infer<typeof appConfigSchema>;
