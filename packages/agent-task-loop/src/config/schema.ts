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

export const appConfigSchema = z.object({
  feishu: z.object({
    baseToken: z.string().min(1),
    tableId: z.string().min(1),
    viewId: z.string().optional(),
  }),
  projects: z.record(projectConfigSchema),
  repositories: z.record(repositoryConfigSchema),
  agents: z.record(agentConfigSchema),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
