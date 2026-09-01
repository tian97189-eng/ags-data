import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SampleReminder from './SampleReminder';
import { useAppStore } from '../../store/useAppStore';

const mocks = vi.hoisted(() => ({
  notifySample: vi.fn(),
  playBeep: vi.fn(),
  ensureNotificationPermission: vi.fn(),
  scheduleSampleReminders: vi.fn(),
  cancelSampleReminders: vi.fn(),
  isNativePlatform: vi.fn(),
}));

vi.mock('../../lib/reminder', () => ({
  buildReminderTimes: (start: Date, iv: number, ct: number) => {
    const list: { at: string; index: number }[] = [];
    for (let i = 0; i < ct; i++) {
      list.push({ at: new Date(start.getTime() + i * iv * 60_000).toISOString(), index: i + 1 });
    }
    return list;
  },
  msToNext: vi.fn((times: { at: string }[], now: Date) => {
    for (const t of times) {
      const ms = new Date(t.at).getTime() - now.getTime();
      if (ms >= 0) return ms;
    }
    return null;
  }),
  notifySample: mocks.notifySample,
  playBeep: mocks.playBeep,
  ensureNotificationPermission: mocks.ensureNotificationPermission,
  scheduleSampleReminders: mocks.scheduleSampleReminders,
  cancelSampleReminders: mocks.cancelSampleReminders,
  isNativePlatform: mocks.isNativePlatform,
}));

describe('SampleReminder', () => {
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.notifySample.mockReset().mockResolvedValue(true);
    mocks.playBeep.mockReset();
    mocks.ensureNotificationPermission.mockReset().mockResolvedValue(true);
    mocks.scheduleSampleReminders.mockReset().mockResolvedValue(false);
    mocks.cancelSampleReminders.mockReset().mockResolvedValue(undefined);
    mocks.isNativePlatform.mockReset().mockReturnValue(false);
    // 用真实 timers 跑 React 渲染；只 spy 捕获组件里设置的定时器
    setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
  });
  let clearTimeoutSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({ toasts: [] });
  });

  it('渲染面板（默认间隔/次数）', () => {
    render(<SampleReminder defaultInterval={30} defaultCount={12} />);
    expect(screen.getByText('取样提醒')).toBeTruthy();
    expect((screen.getByLabelText('取样提醒间隔') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('取样提醒次数') as HTMLInputElement).value).toBe('12');
  });

  it('点开始：立即提醒第 1 次 + 提示音 + 安排下一次定时器', async () => {
    render(<SampleReminder defaultInterval={30} defaultCount={3} />);
    fireEvent.click(screen.getByText('开始提醒'));

    await waitFor(() => {
      expect(mocks.notifySample).toHaveBeenCalledWith(1);
    });
    expect(mocks.playBeep).toHaveBeenCalled();
    // 组件为第 2 次安排了 setTimeout（30 分钟）
    expect(setTimeoutSpy).toHaveBeenCalled();
    const calls = setTimeoutSpy.mock.calls;
    const cb = calls.find((c) => typeof c[0] === 'function');
    expect(cb).toBeTruthy();
    // 界面进入运行态
    expect(screen.getByText('停止')).toBeTruthy();
  });

  it('原生环境：开始提醒会请求权限并排程原生通知', async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.scheduleSampleReminders.mockResolvedValue(true);
    render(<SampleReminder defaultInterval={30} defaultCount={3} />);
    fireEvent.click(screen.getByText('开始提醒'));

    await waitFor(() => {
      expect(mocks.ensureNotificationPermission).toHaveBeenCalled();
      expect(mocks.scheduleSampleReminders).toHaveBeenCalled();
    });
    // 原生排程后不再走浏览器 notifySample
    expect(mocks.notifySample).not.toHaveBeenCalled();
  });

  it('点停止：清除定时器并回到未运行态', async () => {
    render(<SampleReminder defaultInterval={30} defaultCount={5} />);
    fireEvent.click(screen.getByText('开始提醒'));
    await waitFor(() => expect(mocks.notifySample).toHaveBeenCalledWith(1));

    fireEvent.click(screen.getByText('停止'));
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(screen.getByText('开始提醒')).toBeTruthy();
  });

  it('间隔或次数非法时提示且不提醒', async () => {
    render(<SampleReminder defaultInterval={30} defaultCount={12} />);
    fireEvent.change(screen.getByLabelText('取样提醒间隔'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('开始提醒'));

    await waitFor(() => {
      const toasts = useAppStore.getState().toasts;
      expect(toasts.some((t) => t.text.includes('请填写有效'))).toBe(true);
    });
    expect(mocks.notifySample).not.toHaveBeenCalled();
  });
});
