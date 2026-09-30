import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const publishWorkflowPath = new URL('../../.github/workflows/publish.yml', import.meta.url);
const moonBitPublishWorkflowPath = new URL('../../.github/workflows/moonbit-publish.yml', import.meta.url);

test('npm publish workflow invokes MoonBit publish after Changesets publishes packages', async () => {
  const workflow = await readFile(publishWorkflowPath, 'utf8');

  assert.match(workflow, /uses:\s+\.\/\.github\/workflows\/moonbit-publish\.yml/);
  assert.match(workflow, /needs:\s+publish/);
  assert.match(workflow, /if:\s+\$\{\{\s*needs\.publish\.outputs\.published\s*==\s*'true'\s*\}\}/);
});

test('release PR passes the conventional PR title check and npm publish attaches provenance', async () => {
  const workflow = await readFile(publishWorkflowPath, 'utf8');

  assert.match(workflow, /uses:\s+changesets\/action@v2\s*$/m);
  assert.match(workflow, /pr-title:\s+"chore\(release\): version packages"/);
  assert.match(workflow, /commit-message:\s+"chore\(release\): version packages"/);
  assert.match(workflow, /if:\s+steps\.changesets\.outputs\.has-changesets\s*==\s*'false'/);
  assert.match(workflow, /NPM_CONFIG_PROVENANCE:\s+"true"/);
});

test('MoonBit publish workflow can be called by another workflow with credentials inherited', async () => {
  const workflow = await readFile(moonBitPublishWorkflowPath, 'utf8');

  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /MOONCAKES_PERFECTPAN_TOKEN:\s*\n\s+required:\s+true/);
});
