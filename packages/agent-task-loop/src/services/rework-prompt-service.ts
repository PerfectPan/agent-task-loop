export function buildReworkPrompt(input: {
  taskDescription: string;
  resultSummary?: string;
  reviewFindings?: string;
  acceptanceFeedback?: string;
}): string {
  const lines = [
    '你正在处理同一条任务的修复轮次。',
    `原任务：${input.taskDescription}`,
    `上一轮结果：${input.resultSummary ?? '无'}`,
  ];

  if (input.reviewFindings) {
    lines.push('最新 review findings：', input.reviewFindings);
  }
  if (input.acceptanceFeedback) {
    lines.push(
      '董事长最新验收意见（硬约束，必须逐条落实，不能自行优化成别的方案）：',
      input.acceptanceFeedback,
    );
  }

  lines.push(
    '请逐条落实上述反馈。',
    '若董事长明确要求删除某类附加产物（如测试、注释、命名表达），必须直接执行，不能用“更稳妥”“更规范”之类的理由保留它。',
    '修复完成后再进入下一轮 review。',
  );
  return lines.join('\n');
}
