import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '..');
const srcRoot = path.join(packageRoot, 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('RFC 0009 plugin isolation from Room', () => {
  it('does not depend on @rivus/agent-room', async () => {
    const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    expect(packageJson.dependencies?.['@rivus/agent-room']).toBeUndefined();
    expect(packageJson.devDependencies?.['@rivus/agent-room']).toBeUndefined();
    expect(packageJson.peerDependencies?.['@rivus/agent-room']).toBeUndefined();
    expect(packageJson.optionalDependencies?.['@rivus/agent-room']).toBeUndefined();
  });

  it('does not import Room domain types into Task Manager or the Rivus plugin', () => {
    const banned = [
      '@rivus/agent-room',
      'RoomStreamStore',
      'replyInSerial',
      'heldUpToSeq',
      'createMemoryRoomStreamStore',
    ];
    const files = walk(srcRoot).filter(file => {
      const rel = path.relative(srcRoot, file);
      return (
        rel.startsWith('rivus-plugin') ||
        rel.startsWith('task-manager/') ||
        rel.startsWith('orchestration/')
      );
    });
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const token of banned) {
        expect(text, `${path.relative(srcRoot, file)} mentions ${token}`).not.toContain(token);
      }
    }
  });
});
