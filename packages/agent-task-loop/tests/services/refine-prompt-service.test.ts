import { describe, expect, it } from 'vitest';
import { buildRefineDescriptionPrompt } from '../../src/services/refine-prompt-service';

describe('buildRefineDescriptionPrompt', () => {
  it('includes the title and original description and asks for strict JSON', () => {
    const prompt = buildRefineDescriptionPrompt({ title: 'Add dark mode', description: 'make it dark' });
    expect(prompt).toContain('Add dark mode');
    expect(prompt).toContain('make it dark');
    expect(prompt).toContain('{"description"');
    expect(prompt).toContain('markdown'); // instructs no code fences
  });
});
