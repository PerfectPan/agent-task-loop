import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const publishWorkflowPath = new URL('../../.github/workflows/publish.yml', import.meta.url);

test('npm publish workflow no longer builds or publishes the MoonBit module', async () => {
  const workflow = await readFile(publishWorkflowPath, 'utf8');

  assert.doesNotMatch(workflow, /moonbit-publish\.yml/);
  assert.doesNotMatch(workflow, /moon -C packages\/agent-finder/);
  assert.doesNotMatch(workflow, /Install MoonBit/);
});

test('npm publish goes through the shared release workflow with trusted publishing', async () => {
  const workflow = await readFile(publishWorkflowPath, 'utf8');

  assert.match(workflow, /uses:\s+PerfectPan\/gh-repo-checks\/\.github\/workflows\/npm-release\.yml@v\d+/);
  // A called workflow's jobs cannot exceed the caller's grant, so the calling job grants what the shared version
  // and publish jobs narrow down to: contents and pull requests for the version PR, the OIDC token for publishing.
  assert.match(
    workflow,
    /\n    permissions:\n      contents: write\n      pull-requests: write\n      id-token: write\n/,
  );
  // The release gates this repository runs before packing: tests, build and typecheck.
  assert.match(workflow, /check-command:\s+pnpm test && pnpm build && pnpm typecheck/);
});
