import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
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

function moduleSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]!)
    ) {
      specifiers.push(node.arguments[0]!.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return specifiers;
}

function importsAgentRoom(specifier: string): boolean {
  return (
    specifier === '@rivus/agent-room' ||
    specifier.startsWith('@rivus/agent-room/') ||
    (specifier.startsWith('.') && specifier.includes('agent-room'))
  );
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

  it('does not import agent-room anywhere in the package source', () => {
    const files = walk(srcRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const specifier of moduleSpecifiers(file)) {
        expect(
          importsAgentRoom(specifier),
          `${path.relative(srcRoot, file)} imports ${specifier}`,
        ).toBe(false);
      }
    }
  });
});
