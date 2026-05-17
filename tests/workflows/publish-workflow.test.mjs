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

test('MoonBit publish workflow can be called by another workflow with credentials inherited', async () => {
  const workflow = await readFile(moonBitPublishWorkflowPath, 'utf8');

  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /MOONCAKES_PERFECTPAN_TOKEN:\s*\n\s+required:\s+true/);
});
