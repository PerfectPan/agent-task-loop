export function withSystemPrompt(systemPrompt: string | undefined, prompt: string): string {
  const trimmed = systemPrompt?.trim();
  if (!trimmed) return prompt;
  return `${trimmed}\n\n${prompt}`;
}
