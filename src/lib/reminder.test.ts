import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  buildReminderTimes,
  buildDOReminderTimes,
  msToNext,
  ensureNotificationPermission,
  isNativePlatform,
  scheduleSampleReminders,
  cancelSampleReminders,
  playBeep,
} from './reminder';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: vi.fn(),
    createChannel: vi.fn(),
    schedule: vi.fn(),
    cancelAll: vi.fn(),
  },
}));

const mCapacitor = vi.mocked(Capacitor);
const mLocal = vi.mocked(LocalNotifications);

beforeEach(() => {
  mCapacitor.isNativePlatform.mockReturnValue(false);
  mLocal.requestPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  mLocal.createChannel.mockReset().mockResolvedValue(undefined as never);
  mLocal.schedule.mockReset().mockResolvedValue(undefined as never);
  mLocal.cancelAll.mockReset().mockResolvedValue(undefined as never);
});

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

describe('buildDOReminderTimes', () => {
  it('只在连续好氧段内按 15 分钟生成 DO 时刻（含段首段尾）', () => {
    const times = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00'];
    const phases: Record<string, string> = {
      '08:00': 'oxic', '08:30': 'oxic', '09:00': 'oxic',
      '09:30': 'anoxic', '10:00': 'anoxic',
      '10:30': 'oxic', '11:00': 'oxic',
    };
    const list = buildDOReminderTimes(times, phases as never, '2026-09-01', 15);
    // 好氧段1: 08:00~09:00（60min）→ 5 点；好氧段2: 10:30~11:00（30min）→ 3 点
    expect(list).toHaveLength(8);
    const gaps = list.slice(1).map((r, i) => new Date(r.at).getTime() - new Date(list[i].at).getTime());
    // 段内每 15 分钟：前 4 个间隔 + 后 2 个间隔都是 15min；段间（09:00→10:30）是 90min
    expect(gaps[0]).toBe(15 * 60_000);
    expect(gaps[1]).toBe(15 * 60_000);
    expect(gaps[2]).toBe(15 * 60_000);
    expect(gaps[3]).toBe(15 * 60_000);
    expect(gaps[4]).toBe(90 * 60_000); // 跨越缺氧段
    expect(gaps[5]).toBe(15 * 60_000);
    expect(gaps[6]).toBe(15 * 60_000);
    expect(list[0].index).toBe(1);
    expect(list[7].index).toBe(8);
  });

  it('没有好氧段时返回空', () => {
    const times = ['08:00', '08:30'];
    const phases: Record<string, string> = { '08:00': 'anoxic', '08:30': 'anoxic' };
    expect(buildDOReminderTimes(times, phases as never, '2026-09-01', 15)).toEqual([]);
  });

  it('间隔非法时返回空', () => {
    const times = ['08:00'];
    const phases: Record<string, string> = { '08:00': 'oxic' };
    expect(buildDOReminderTimes(times, phases as never, '2026-09-01', 0)).toEqual([]);
  });
});

describe('isNativePlatform', () => {
  it('Web 环境返回 false', () => {
    mCapacitor.isNativePlatform.mockReturnValue(false);
    expect(isNativePlatform()).toBe(false);
  });

  it('原生环境返回 true', () => {
    mCapacitor.isNativePlatform.mockReturnValue(true);
    expect(isNativePlatform()).toBe(true);
  });
});

describe('ensureNotificationPermission', () => {
  it('Web 环境：浏览器不支持 Notification 返回 false（jsdom）', async () => {
    mCapacitor.isNativePlatform.mockReturnValue(false);
    const p = await ensureNotificationPermission();
    expect(typeof p).toBe('boolean');
  });

  it('原生环境：请求系统权限并返回是否授权', async () => {
    mCapacitor.isNativePlatform.mockReturnValue(true);
    mLocal.requestPermissions.mockResolvedValue({ display: 'granted' });
    expect(await ensureNotificationPermission()).toBe(true);
    expect(mLocal.requestPermissions).toHaveBeenCalled();

    mLocal.requestPermissions.mockResolvedValue({ display: 'denied' });
    expect(await ensureNotificationPermission()).toBe(false);
  });
});

describe('scheduleSampleReminders（原生）', () => {
  const times = [
    { at: '2026-09-01T08:00:00.000Z', index: 1 },
    { at: '2026-09-01T08:30:00.000Z', index: 2 },
  ];

  it('Web 环境不排程，返回 false', async () => {
    mCapacitor.isNativePlatform.mockReturnValue(false);
    expect(await scheduleSampleReminders(times, '取样提醒')).toBe(false);
    expect(mLocal.schedule).not.toHaveBeenCalled();
  });

  it('原生环境：创建通知渠道并排程所有提醒（带声音）', async () => {
    mCapacitor.isNativePlatform.mockReturnValue(true);
    const ok = await scheduleSampleReminders(times, '取样提醒');
    expect(ok).toBe(true);
    expect(mLocal.createChannel).toHaveBeenCalled();
    expect(mLocal.schedule).toHaveBeenCalledTimes(1);
    const arg = mLocal.schedule.mock.calls[0][0] as { notifications: unknown[] };
    expect(arg.notifications).toHaveLength(2);
    const first = arg.notifications[0] as { sound: string; channelId: string; title: string };
    expect(first.sound).toBe('default');
    expect(first.channelId).toBe('ags-sampling');
    expect(first.title).toBe('取样提醒');
  });

  it('原生环境：空列表不排程，返回 false', async () => {
    mCapacitor.isNativePlatform.mockReturnValue(true);
    expect(await scheduleSampleReminders([], '取样提醒')).toBe(false);
    expect(mLocal.schedule).not.toHaveBeenCalled();
  });

  it('原生环境：schedule 抛错时返回 false', async () => {
    mCapacitor.isNativePlatform.mockReturnValue(true);
    mLocal.schedule.mockRejectedValue(new Error('boom'));
    expect(await scheduleSampleReminders(times, '取样提醒')).toBe(false);
  });
});

describe('cancelSampleReminders', () => {
  it('原生环境取消所有提醒', async () => {
    mCapacitor.isNativePlatform.mockReturnValue(true);
    await cancelSampleReminders();
    expect(mLocal.cancelAll).toHaveBeenCalled();
  });

  it('Web 环境不调用原生取消', async () => {
    mCapacitor.isNativePlatform.mockReturnValue(false);
    await cancelSampleReminders();
    expect(mLocal.cancelAll).not.toHaveBeenCalled();
  });
});

describe('playBeep', () => {
  it('jsdom 无 AudioContext 时不抛错', () => {
    expect(() => playBeep()).not.toThrow();
  });
});
