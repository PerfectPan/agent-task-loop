import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { RoomLabHost } from './room-lab-host.server';
import { SqliteRoomStore } from '../infrastructure/sqlite-room-store.server';
import { SqliteTurnLog } from '../infrastructure/sqlite-turn-log.server';

/**
 * The host's activation end to end, over the same fake ACP process the
 * infrastructure tests drive: the room's own permission policy answering the
 * agent's live permission requests over the kit's connection, and the one
 * failed row an activation that dies before its turn leaves behind.
 */

const FAKE_AGENT = fileURLToPath(new URL('../infrastructure/testing/fake-room-agent.ts', import.meta.url));

const dirs: string[] = [];
const envKeys = ['CLAUDE_FAKE_NEW', 'CLAUDE_FAKE_PERMISSION_REPORT'];

afterEach(() => {
  for (const key of envKeys) {
    delete process.env[key];
  }
  delete process.env.RIVUS_ROOM_HOME;
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Lab {
  host: RoomLabHost;
  roomId: string;
  /** The room's default working directory; the policy's inside. */
  cwd: string;
  /** Read directly, so waiting for rows does not re-run the desk's probe. */
  turnLog: SqliteTurnLog;
}

async function openLab(): Promise<Lab> {
  const home = mkdtempSync(join(tmpdir(), 'rivus-room-host-'));
  dirs.push(home);
  process.env.RIVUS_ROOM_HOME = home;
  const store = SqliteRoomStore.open(home);
  const host = new RoomLabHost(store);
  await host.addAgent({
    id: 'fake-room-agent',
    label: 'Fake',
    command: `${process.execPath} ${FAKE_AGENT}`,
  });
  const room = await host.create({ title: 'host 测试', memberIds: ['fake-room-agent'] });
  return { host, roomId: room.roomId, cwd: join(home, 'work', room.roomId), turnLog: new SqliteTurnLog(store.db) };
}

/** The turn rows of the room, once at least `count` have landed. */
async function turnsOf(lab: Lab, count: number) {
  let turns = lab.turnLog.listByRoom(lab.roomId);
  await vi.waitFor(
    () => {
      turns = lab.turnLog.listByRoom(lab.roomId);
      expect(turns.length).toBeGreaterThanOrEqual(count);
    },
    { timeout: 15_000, interval: 100 },
  );
  return turns;
}

/** The permission outcome the agent received, read from the report it wrote. */
function permissionOutcome(report: string): { outcome: string; optionId?: string } {
  expect(existsSync(report)).toBe(true);
  return JSON.parse(readFileSync(report, 'utf8')) as { outcome: string; optionId?: string };
}

describe('RoomLabHost activations against a fake ACP agent', () => {
  it(
    'answers the agent permission requests with the room policy: inside cwd is allowed, outside is denied',
    { timeout: 60_000 },
    async () => {
      const report = join(tmpdir(), `rivus-permission-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      process.env.CLAUDE_FAKE_PERMISSION_REPORT = report;
      const lab = await openLab();
      try {
        // A call that names no path is judged inside, so the request is
        // answered with the request's allow option — not the kit's silent
        // denial it read before the policy was wired into the connection.
        await lab.host.act(lab.roomId, { action: 'message', body: 'permission: now' });
        await turnsOf(lab, 1);
        expect(permissionOutcome(report)).toEqual({ outcome: 'selected', optionId: 'allow-once' });

        // A write inside the room's cwd is allowed; the same call naming a
        // directory outside it is denied.
        await lab.host.act(lab.roomId, {
          action: 'message',
          body: `permission: kind=edit path=${join(lab.cwd, 'note.md')}`,
        });
        await turnsOf(lab, 2);
        expect(permissionOutcome(report)).toEqual({ outcome: 'selected', optionId: 'allow-once' });

        await lab.host.act(lab.roomId, {
          action: 'message',
          body: `permission: kind=edit path=${join(tmpdir(), 'rivus-elsewhere', 'note.md')}`,
        });
        await turnsOf(lab, 3);
        expect(permissionOutcome(report)).toEqual({ outcome: 'selected', optionId: 'reject-once' });
      } finally {
        await lab.host.close();
      }
    },
  );

  it(
    'writes one failed row for an activation that dies opening its session, not a timeout and not two rows',
    { timeout: 60_000 },
    async () => {
      process.env.CLAUDE_FAKE_NEW = 'error';
      const lab = await openLab();
      try {
        await lab.host.act(lab.roomId, { action: 'message', body: 'hello' });
        await turnsOf(lab, 1);
        // The second row used to land right behind the first; a settle pass
        // over the same window pins that it never comes.
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        const rows = lab.turnLog.listByRoom(lab.roomId).map((row) => ({
          outcome: row.outcome,
          error: row.error,
        }));
        expect(rows).toEqual([{ outcome: 'failed', error: expect.stringContaining('session/new') }]);
        expect(rows[0]?.outcome).not.toBe('timeout');
        expect(rows[0]?.error).not.toContain('turn timed out');
      } finally {
        await lab.host.close();
      }
    },
  );
});
