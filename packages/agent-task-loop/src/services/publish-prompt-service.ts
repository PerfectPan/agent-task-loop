export function buildCommitPrompt(input: {
  taskTitle: string;
  taskDescription: string;
  resultSummary?: string;
  sessionHistory?: string;
  diffStat?: string;
  diff?: string;
}): string {
  return [
    '你是资深提交信息生成器。',
    '请基于以下任务上下文和代码变更，只输出最终 commit message，不要加解释，不要用 markdown 代码块。',
    'commit message 允许多行，第一行是 subject，后面可以有空行和简短 body。',
    `任务标题：${input.taskTitle}`,
    `任务描述：${input.taskDescription}`,
    `ResultSummary：${input.resultSummary ?? ''}`,
    `SessionHistory：${input.sessionHistory ?? ''}`,
    `DiffStat：${input.diffStat ?? ''}`,
    `Diff：${input.diff ?? ''}`,
  ].join('\n');
}

export function buildPullRequestPrompt(input: {
  taskTitle: string;
  taskDescription: string;
  resultSummary?: string;
  sessionHistory?: string;
  commitSummary: string;
}): string {
  return [
    '你是资深 Pull Request 撰写助手。',
    '请输出严格 JSON：{"title":"...","body":"..."}，不要输出任何额外解释，不要加 markdown 代码块。',
    'PR 标题要简短明确，PR 正文需要包含：需求背景、根因、修复内容、验证结果。',
    `任务标题：${input.taskTitle}`,
    `任务描述：${input.taskDescription}`,
    `ResultSummary：${input.resultSummary ?? ''}`,
    `SessionHistory：${input.sessionHistory ?? ''}`,
    `CommitSummary：${input.commitSummary}`,
  ].join('\n');
}
