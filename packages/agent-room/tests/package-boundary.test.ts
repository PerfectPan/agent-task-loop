import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(import.meta.dirname, '../src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('package boundary', () => {
  it('keeps domain files free of node: and adapters', () => {
    const domainRoot = path.join(srcRoot, 'domain');
    const files = walk(domainRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, path.basename(file)).not.toContain('node:');
      expect(text, path.basename(file)).not.toContain('node:fs');
    }
  });

  it('does not import occupancy, task-loop, or Feishu types', () => {
    const banned = [
      '@rivus/agent-orchestration',
      '@rivus/agent-task-loop',
      'TaskRecord',
      '待处理',
      '待复核',
      'ReviewLoop',
      'feishu',
      'Orchestration',
      'allow(seat)',
    ];
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      for (const token of banned) {
        expect(text, `${path.basename(file)} mentions ${token}`).not.toContain(token);
      }
    }
  });
});
