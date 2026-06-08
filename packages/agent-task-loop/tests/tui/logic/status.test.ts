import { describe, expect, it } from 'vitest';
import { TASK_STATUSES } from '../../../src/types/task';
import {
  STATUS_CONFIG,
  STATUS_ORDER,
  TABS,
  bucketOf,
  isLiveStatus,
  statusConfig,
  statusWeight,
  tabIncludes,
} from '../../../src/tui/logic/status';

describe('status config exhaustiveness', () => {
  it('every TaskStatus has a config with a bucket, glyph, color and label', () => {
    for (const status of TASK_STATUSES) {
      const cfg = STATUS_CONFIG[status];
      expect(cfg, `missing config for ${status}`).toBeDefined();
      expect(cfg.glyph.length).toBeGreaterThan(0);
      expect(cfg.color.length).toBeGreaterThan(0);
      expect(cfg.label).toBe(status);
      expect(['running', 'queued', 'needs-input', 'done']).toContain(cfg.bucket);
    }
  });

  it('every TaskStatus has a sort weight', () => {
    for (const status of TASK_STATUSES) {
      expect(STATUS_ORDER[status], `missing order for ${status}`).toBeTypeOf('number');
    }
  });

  it('config has no extra keys beyond the declared statuses', () => {
    expect(Object.keys(STATUS_CONFIG).sort()).toEqual([...TASK_STATUSES].sort());
  });
});

describe('bucket mapping', () => {
  it('groups statuses into the expected buckets', () => {
    expect(bucketOf('待处理')).toBe('queued');
    expect(bucketOf('执行中')).toBe('running');
    expect(bucketOf('修复中')).toBe('running');
    expect(bucketOf('待复核')).toBe('running');
    expect(bucketOf('待决策')).toBe('needs-input');
    expect(bucketOf('待验收')).toBe('needs-input');
    expect(bucketOf('已完成')).toBe('done');
    expect(bucketOf('已失败')).toBe('done');
  });

  it('every status lands in at least one non-"all" tab', () => {
    for (const status of TASK_STATUSES) {
      const named = TABS.filter(t => t.key !== 'all').some(t => tabIncludes(t.key, status));
      expect(named, `${status} is hidden from every named tab`).toBe(true);
    }
  });

  it('the All tab includes every status', () => {
    for (const status of TASK_STATUSES) {
      expect(tabIncludes('all', status)).toBe(true);
    }
  });

  it('Active tab covers running + queued, excludes done and needs-input', () => {
    expect(tabIncludes('active', '执行中')).toBe(true);
    expect(tabIncludes('active', '待处理')).toBe(true);
    expect(tabIncludes('active', '已完成')).toBe(false);
    expect(tabIncludes('active', '待决策')).toBe(false);
  });
});

describe('helpers', () => {
  it('statusConfig falls back safely for an unknown status', () => {
    const cfg = statusConfig('???' as never);
    expect(cfg.glyph).toBe('?');
    expect(cfg.bucket).toBe('queued');
  });

  it('isLiveStatus is true only for actively-working statuses', () => {
    expect(isLiveStatus('执行中')).toBe(true);
    expect(isLiveStatus('修复中')).toBe(true);
    expect(isLiveStatus('待处理')).toBe(false);
    expect(isLiveStatus('已完成')).toBe(false);
  });

  it('statusConfig.color and statusWeight resolve from config', () => {
    expect(statusConfig('已失败').color).toBe('red');
    expect(statusWeight('执行中')).toBe(0);
    expect(statusWeight('已完成')).toBe(9);
  });
});
