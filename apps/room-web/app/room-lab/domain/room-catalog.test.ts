import { describe, expect, it } from 'vitest';
import { RoomCatalog } from './room-catalog';

describe('RoomCatalog', () => {
  it('creates rooms by topic and lists the most recently opened first', () => {
    const catalog = new RoomCatalog();
    catalog.create({
      id: 'r_aaaaaaaaaa',
      title: '  Q3 定价方案 ',
      now: '2026-09-06T01:00:00.000Z',
      memberIds: ['codex', 'claude'],
    });
    catalog.create({
      id: 'r_bbbbbbbbbb',
      title: 'README 改写',
      now: '2026-09-06T02:00:00.000Z',
    });
    catalog.touch('r_aaaaaaaaaa', '2026-09-06T03:00:00.000Z');

    expect(catalog.list().map(room => room.id)).toEqual(['r_aaaaaaaaaa', 'r_bbbbbbbbbb']);
    expect(catalog.get('r_aaaaaaaaaa')).toMatchObject({
      title: 'Q3 定价方案',
      memberIds: ['codex', 'claude'],
    });
    expect(catalog.lastOpened()?.id).toBe('r_aaaaaaaaaa');
  });

  it('rejects a blank title and an empty crew', () => {
    const catalog = new RoomCatalog();
    expect(() => catalog.create({
      id: 'r_cccccccccc',
      title: '   ',
      now: '2026-09-06T01:00:00.000Z',
    })).toThrow('Room title is required');
    expect(() => catalog.create({
      id: 'r_cccccccccc',
      title: '空房间',
      now: '2026-09-06T01:00:00.000Z',
      memberIds: [],
    })).toThrow('A Room needs at least one active agent');
  });
});
