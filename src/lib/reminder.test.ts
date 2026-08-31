import { describe, it, expect } from 'vitest';
import { buildReminderTimes, msToNext, ensureNotificationPermission } from './reminder';

describe('buildReminderTimes', () => {
  it('按间隔生成提醒时刻（含起点）', () => {
    const start = new Date('2026-09-01T08:00:00+08:00');
    const list = buildReminderTimes(start, 30, 3);
    expect(list).toHaveLength(3);
    expect(list[0].index).toBe(1);
    expect(list[1].index).toBe(2);
    expect(new Date(list[1].at).getTime() - new Date(list[0].at).getTime()).toBe(30 * 60_000);
    expect(new Date(list[2].at).getTime() - new Date(list[1].at).getTime()).toBe(30 * 60_000);
  });

  it('间隔或次数非法时返回空', () => {
    const start = new Date();
    expect(buildReminderTimes(start, 0, 3)).toEqual([]);
    expect(buildReminderTimes(start, 30, 0)).toEqual([]);
  });
});

describe('msToNext', () => {
  it('返回下一个提醒的毫秒数', () => {
    const times = [
      { at: '2026-09-01T08:00:00.000Z', index: 1 },
      { at: '2026-09-01T08:30:00.000Z', index: 2 },
    ];
    expect(msToNext(times, new Date('2026-09-01T08:10:00.000Z'))).toBe(20 * 60_000);
    expect(msToNext(times, new Date('2026-09-01T08:30:00.000Z'))).toBe(0);
  });

  it('全部已过返回 null', () => {
    const times = [{ at: '2026-09-01T08:00:00.000Z', index: 1 }];
    expect(msToNext(times, new Date('2026-09-01T09:00:00.000Z'))).toBeNull();
  });
});

describe('ensureNotificationPermission', () => {
  it('浏览器不支持 Notification 返回 false（jsdom 环境）', async () => {
    const win = window as unknown as { Notification?: unknown };
    if ('Notification' in win) {
      // jsdom 可能没有，这里兜底
      const p = await ensureNotificationPermission();
      expect(typeof p).toBe('boolean');
    } else {
      expect(await ensureNotificationPermission()).toBe(false);
    }
  });
});
