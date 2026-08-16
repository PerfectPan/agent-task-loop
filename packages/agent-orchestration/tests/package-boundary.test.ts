import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(import.meta.dirname, '../src');
const packageRoot = path.resolve(import.meta.dirname, '..');

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
  it('does not import agent-task-loop or task/feishu types', () => {
    const banned = [
      '@rivus/agent-task-loop',
      'TaskRecord',
      '待处理',
      '待复核',
      'ReviewLoop',
      'feishu',
    ];
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      for (const token of banned) {
        expect(text, `${path.relative(srcRoot, file)} mentions ${token}`).not.toContain(token);
      }
    }
  });

  it('keeps domain, application and contracts free of infrastructure and host I/O', () => {
    const banned = [
      "from '../infrastructure/",
      'from "../infrastructure',
      "from '../../infrastructure",
      'from "../../infrastructure',
      "from 'node:",
      'from "node:',
      'better-sqlite3',
      'execa',
      'process.kill',
      'process.pid',
      'writeFileSync',
    ];
    for (const file of walk(srcRoot).filter(item =>
      item.includes(`${path.sep}application${path.sep}`) ||
      item.includes(`${path.sep}contracts${path.sep}`) ||
      item.includes(`${path.sep}domain${path.sep}`),
    )) {
      const text = readFileSync(file, 'utf8');
      for (const token of banned) {
        expect(text, `${path.relative(srcRoot, file)} contains ${token}`).not.toContain(token);
      }
    }
  });

  it('keeps the write side off channel reads and the read side off mutations', () => {
    const commands = readFileSync(path.join(srcRoot, 'application', 'commands.ts'), 'utf8');
    const queries = readFileSync(path.join(srcRoot, 'application', 'queries.ts'), 'utf8');
    expect(commands).not.toContain('listChannel');
    expect(commands).not.toContain('listInbox');
    expect(queries).not.toContain('casRun');
    expect(queries).not.toContain('insertToken');
    expect(queries).not.toContain('appendChannel');
    expect(queries).not.toContain('insertRun');
    expect(queries).not.toContain('touchHeartbeat');
  });

  it('defines createOrchestration only in the node factory', () => {
    const hits = walk(srcRoot).filter(file => {
      const text = readFileSync(file, 'utf8');
      return /export function createOrchestration/.test(text);
    });
    expect(hits.map(file => path.relative(srcRoot, file))).toEqual([
      path.join('infrastructure', 'node-factory.ts'),
    ]);
  });

  it('keeps node:sqlite inside infrastructure', () => {
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      if (text.includes('node:sqlite')) {
        expect(file).toContain(`${path.sep}infrastructure${path.sep}`);
      }
    }
  });

  it('declares engines >=22.13 and does not depend on better-sqlite3 or execa', () => {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
      dependencies?: Record<string, string>;
    };
    expect(pkg.engines?.node).toBe('>=22.13');
    expect(pkg.dependencies?.['better-sqlite3']).toBeUndefined();
    expect(pkg.dependencies?.execa).toBeUndefined();
    const distDir = path.join(packageRoot, 'dist');
    const distFiles = readdirSync(distDir).filter(name => name.endsWith('.js'));
    const dist = distFiles.map(name => readFileSync(path.join(distDir, name), 'utf8')).join('\n');
    expect(dist).not.toContain('better-sqlite3');
    expect(distFiles.some(name => name.endsWith('.node'))).toBe(false);
    expect(dist).toMatch(/from ["']node:sqlite["']/);
  });
});
