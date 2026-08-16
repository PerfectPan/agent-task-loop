import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OrchestrationConflictError } from '@rivus/agent-orchestration';
import { authorizeSeat, harvestImplMailIfNeeded, wrapReviewVerdictIfNeeded } from '../src/orchestration/round';
import { createTaskOrchestration, taskOrchestrationKey } from '../src/orchestration/task-orchestration';

const orchBin = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../agent-orchestration/bin/orch.mjs',
);

function orch(
  dbPath: string,
  seat: string,
  args: string[],
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [orchBin, ...args], {
    env: {
      ...process.env,
      ORCH_DB: dbPath,
      ORCH_RUN: KEY,
      ORCH_SEAT: seat,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function step(title: string): void {
  console.log(`\n== ${title} ==`);
}

const dir = mkdtempSync(path.join(os.tmpdir(), 'orch-scenario-'));
const dbPath = path.join(dir, 'orchestration.db');
const KEY = taskOrchestrationKey('ROLL-1');
const failures: string[] = [];

function expect(cond: unknown, message: string): void {
  if (!cond) {
    failures.push(message);
    console.log(`FAIL  ${message}`);
  } else {
    console.log(`ok    ${message}`);
  }
}

try {
  const supervisor = createTaskOrchestration({ dbPath });
  step('supervisor open + grant impl');
  const opened = supervisor.open({
    key: KEY,
    template: 'classic-delivery',
    goal: '修 auth.ts 泄漏，然后报数给 review',
    ref: { taskId: 'ROLL-1' },
  });
  supervisor.grant({ key: KEY, seat: 'impl', expectedTerm: opened.term });
  const implPermit = authorizeSeat(supervisor, KEY, 'impl');
  console.log(JSON.stringify({ tokens: supervisor.snapshot({ key: KEY }).tokens, implPermit }, null, 2));
  expect(implPermit.seat === 'impl', 'impl 拿到 spawn 许可');

  step('impl 用真 orch CLI 给 review 留言（send 不发牌）');
  const sent = orch(dbPath, 'impl', [
    'send',
    'review',
    JSON.stringify({ summary: 'auth.ts 泄漏已修，请看 login 路径' }),
    '--kind',
    'review-request',
  ]);
  console.log(sent.stdout.trim() || sent.stderr.trim());
  expect(sent.status === 0, `impl orch send 退出码 0，实际 ${sent.status}`);
  expect(
    supervisor.snapshot({ key: KEY }).tokens[0]?.seat === 'impl',
    'orch send 之后 Token 仍在 impl',
  );

  step('review 还没上场时 pull，应能看见留言');
  const preview = orch(dbPath, 'review', ['pull']);
  console.log(preview.stdout.trim());
  expect(preview.status === 0 && preview.stdout.includes('auth.ts'), 'review orch pull 读到 impl 留言');
  expect(orch(dbPath, 'review', ['pull']).stdout.trim() === '[]', '第二次 pull 为空（已 markRead）');

  step('监督者把牌交给 review');
  const reviewPermit = authorizeSeat(supervisor, KEY, 'review');
  console.log(JSON.stringify({ tokens: supervisor.snapshot({ key: KEY }).tokens, reviewPermit }, null, 2));
  expect(reviewPermit.seat === 'review', 'review 拿到 spawn 许可');
  expect(supervisor.snapshot({ key: KEY }).tokens[0]?.seat === 'review', 'Token 现在在 review');

  step('无牌的 impl 不能 authorizeSpawn');
  let unauthorized = false;
  try {
    supervisor.authorizeSpawn({
      key: KEY,
      seat: 'impl',
      expectedTerm: supervisor.snapshot({ key: KEY }).term,
    });
  } catch (error) {
    unauthorized = error instanceof Error && error.name === 'OrchestrationUnauthorizedError';
    console.log(error instanceof Error ? error.message : error);
  }
  expect(unauthorized, 'impl 交牌后不能再 spawn');

  step('review 用 orch 回一条 verdict（不再 harvest）');
  const verdict = orch(dbPath, 'review', [
    'send',
    'impl',
    JSON.stringify({ verdict: '驳回', findings: 'login 路径还缺失败用例' }),
    '--kind',
    'review-verdict',
  ]);
  console.log(verdict.stdout.trim() || verdict.stderr.trim());
  expect(verdict.status === 0, 'review orch send 成功');

  step('impl pull 审查留言；不因此获得 Token');
  const implInbox = orch(dbPath, 'impl', ['pull']);
  console.log(implInbox.stdout.trim());
  expect(implInbox.stdout.includes('失败用例'), 'impl 读到 review-verdict');
  expect(supervisor.snapshot({ key: KEY }).tokens[0]?.seat === 'review', '留言不发牌，Token 仍在 review');

  step('驳回后把牌交回 impl');
  authorizeSeat(supervisor, KEY, 'impl');
  expect(supervisor.snapshot({ key: KEY }).tokens[0]?.seat === 'impl', 'Token 回到 impl');

  step('harvest 回退：本轮没有 orch send，才从 stdout 回收');
  const since = supervisor.snapshot({ key: KEY }).lastIndex;
  const skipped = harvestImplMailIfNeeded(
    supervisor,
    KEY,
    '{"mail":[{"to":"review","mailKind":"review-request","body":{"summary":"不该双写"}}]}',
    0,
  );
  expect(skipped.length === 0, 'channel 里已有 impl mail，不再 harvest');
  const harvested = harvestImplMailIfNeeded(
    supervisor,
    KEY,
    '{"mail":[{"to":"review","mailKind":"note","body":{"summary":"第二轮补充"}}]}',
    since,
  );
  expect(harvested.length === 1, '新一轮无 orch send 时 harvest 成功');

  step('review wrap：已有 verdict 不再包一层');
  const sinceReview = supervisor.snapshot({ key: KEY }).lastIndex;
  const wrapped = wrapReviewVerdictIfNeeded(
    supervisor,
    KEY,
    { verdict: '通过', findings: '' },
    0,
  );
  expect(wrapped === undefined, '已有 review-verdict，不再 wrap');
  const freshWrap = wrapReviewVerdictIfNeeded(
    supervisor,
    KEY,
    { verdict: '通过', findings: '' },
    sinceReview,
  );
  expect(freshWrap?.mailKind === 'review-verdict', '新窗口可以再 wrap 一次');

  step('冒充座位应失败');
  const fake = orch(dbPath, 'impl', ['send', 'review', 'x', '--seat', 'review']);
  console.log(fake.stderr.trim());
  expect(fake.status !== 0 && fake.stderr.includes('ORCH_SEAT'), 'CLI 拒绝 --seat 冒充');

  step('第二位监督者抢同一把 Key');
  const rival = createTaskOrchestration({ dbPath, supervisorPid: 999 });
  let conflict = false;
  try {
    rival.open({ key: KEY, template: 'classic-delivery' });
  } catch (error) {
    conflict = error instanceof OrchestrationConflictError;
    console.log(error instanceof Error ? error.message : error);
  }
  expect(conflict, '新鲜 occupy 下第二次 open 冲突');

  step('orch log（和以后界面同一份 Channel）');
  const log = orch(dbPath, 'impl', ['log', '--from', '1']);
  console.log(log.stdout.trim());
  const page = JSON.parse(log.stdout) as { entries: Array<{ kind: string; mailKind: string | null }> };
  const kinds = page.entries.map(entry => (entry.kind === 'mail' ? `mail:${entry.mailKind}` : entry.kind));
  console.log('kinds:', kinds.join(' -> '));
  expect(kinds.includes('mail:review-request'), 'channel 里有 review-request');
  expect(kinds.includes('mail:review-verdict'), 'channel 里有 review-verdict');
  expect(kinds.includes('grant') && kinds.includes('pass'), 'channel 里有 grant/pass');

  step('release');
  supervisor.release({ key: KEY });
  expect(supervisor.snapshot({ key: KEY }).status === 'released', 'release 后 status=released');
  expect(supervisor.snapshot({ key: KEY }).tokens.length === 0, 'release 后 Token 清空');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('\n== 结果 ==');
if (failures.length > 0) {
  console.log(`${failures.length} failed:`);
  for (const item of failures) {
    console.log(`- ${item}`);
  }
  process.exit(1);
}
console.log('classic-delivery 真实场景全部通过');
