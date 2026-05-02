import type { TaskRecord } from '../types/task';

export function buildTaskPrompt(input: {
  task: TaskRecord;
  projectName: string;
  repositoryKey: string;
  workspacePath: string;
  taskTemplatePrompt?: string;
  promptOverride?: string;
}): string {
  const sections = [
    input.taskTemplatePrompt?.trim(),
    `Project: ${input.projectName} (${input.task.project})`,
    `Repository: ${input.repositoryKey}`,
    `Workspace: ${input.workspacePath}`,
    `TaskID: ${input.task.taskId}`,
    `Title: ${input.task.title}`,
    `Description: ${input.task.description}`,
    input.promptOverride?.trim(),
    'Complete the task in the workspace above and keep the final summary concise.',
  ];

  return sections.filter(Boolean).join('\n\n');
}
