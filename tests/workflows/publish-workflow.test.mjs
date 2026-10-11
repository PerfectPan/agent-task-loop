import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const publishWorkflowPath = new URL('../../.github/workflows/publish.yml', import.meta.url);
const moonBitPublishWorkflowPath = new URL('../../.github/workflows/moonbit-publish.yml', import.meta.url);

test('npm publish workflow no longer builds or publishes the MoonBit module', async () => {
  const workflow = await readFile(publishWorkflowPath, 'utf8');

  assert.doesNotMatch(workflow, /moonbit-publish\.yml/);
  assert.doesNotMatch(workflow, /moon -C packages\/agent-finder/);
  assert.doesNotMatch(workflow, /Install MoonBit/);
});

test('release PR passes the conventional PR title check and npm publish uses trusted publishing', async () => {
  const workflow = await readFile(publishWorkflowPath, 'utf8');

  assert.match(workflow, /uses:\s+changesets\/action@v2\s*$/m);
  assert.match(workflow, /pr-title:\s+["']chore\(release\): version packages["']/);
  assert.match(workflow, /commit-message:\s+["']chore\(release\): version packages["']/);
  assert.match(workflow, /if:\s+steps\.changesets\.outputs\.has-changesets\s*==\s*'false'/);
  // pnpm publish gets its npm token and provenance from the OIDC exchange.
  assert.match(workflow, /id-token:\s+write/);
});

// The MoonBit module is deleted; the workflow stays until the wrap-up step
// deprecates @rivus/agent-finder-core on npm and removes the mooncakes token.
test('retained MoonBit publish workflow can still be called with credentials inherited', async () => {
  const workflow = await readFile(moonBitPublishWorkflowPath, 'utf8');

  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /MOONCAKES_PERFECTPAN_TOKEN:\s*\n\s+required:\s+true/);
});
