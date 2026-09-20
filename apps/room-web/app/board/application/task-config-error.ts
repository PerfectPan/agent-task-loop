/**
 * The task-loop package reports a missing config as prose, so both board
 * loaders had to sniff the same three substrings. One reading, one message.
 */
const MISSING_CONFIG = ['No config found', 'Config file not found', 'agent-task-loop init'];

const MISSING_CONFIG_MESSAGE =
  '未找到任务后端配置。请运行 `agent-task-loop init` 初始化配置，或设置环境变量 AGENT_TASK_LOOP_CONFIG。';

export function formatTaskLoadError(error: unknown, subject: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (MISSING_CONFIG.some(phrase => raw.includes(phrase))) return MISSING_CONFIG_MESSAGE;
  return `无法加载${subject}：${raw}`;
}
