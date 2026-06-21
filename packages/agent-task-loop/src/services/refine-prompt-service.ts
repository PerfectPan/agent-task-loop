export function buildRefineDescriptionPrompt(input: { title: string; description: string }): string {
  return [
    '你是资深需求/任务描述润色助手。',
    '请基于任务标题与原始描述，产出一份更清晰、结构化、可执行的任务描述。',
    '保留原意，不要臆造不存在的需求；可以补充验收标准与边界条件。',
    '请输出严格 JSON：{"description":"..."}，不要输出任何额外解释，不要加 markdown 代码块。',
    `任务标题：${input.title}`,
    `原始描述：${input.description}`,
  ].join('\n');
}
