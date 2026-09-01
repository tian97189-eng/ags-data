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
      expect(mocks.notifySample).toHaveBeenCalledWith(1, '取样提醒');
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
    await waitFor(() => expect(mocks.notifySample).toHaveBeenCalledWith(1, '取样提醒'));

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

  it('buildExternalTimes 回调：点开始用回调生成的时刻，且文案用 text', async () => {
    const now = Date.now();
    const times = [
      { at: new Date(now + 1000).toISOString(), index: 1, text: '#1 加甲液' },
      { at: new Date(now + 2000).toISOString(), index: 2, text: '#2 加甲液' },
    ];
    const build = vi.fn(() => times);
    render(
      <SampleReminder label="PN 加药提醒" buildExternalTimes={build} externalHint="测试提示" />,
    );
    // 不显示间隔/次数输入框
    expect(screen.queryByLabelText('PN 加药提醒间隔')).toBeNull();
    expect(screen.getByText('测试提示')).toBeTruthy();

    fireEvent.click(screen.getByText('开始提醒'));

    await waitFor(() => {
      expect(build).toHaveBeenCalled();
      // notifySample 带上了 text 文案
      expect(mocks.notifySample).toHaveBeenCalledWith(1, 'PN 加药提醒', '#1 加甲液');
    });
    // 立即触发第一次后，界面显示进度
    expect(screen.getByText('停止')).toBeTruthy();
  });

  it('buildExternalTimes 返回空：提示且不提醒', async () => {
    const build = vi.fn(() => []);
    render(<SampleReminder label="PN 加药提醒" buildExternalTimes={build} />);
    fireEvent.click(screen.getByText('开始提醒'));

    await waitFor(() => {
      const toasts = useAppStore.getState().toasts;
      expect(toasts.some((t) => t.text.includes('没有可用的'))).toBe(true);
    });
    expect(mocks.notifySample).not.toHaveBeenCalled();
  });

  it('运行时显示大字号正计时秒表 + 距离下次响铃小倒计时（< 10 秒时变红）', async () => {
    const now = Date.now();
    const times = [
      { at: new Date(now + 300).toISOString(), index: 1, text: '#1 加甲液' },
      // 第二个时刻留够余量，避免 scheduleNext 找不到下一个导致 running=false
      { at: new Date(now + 5_500).toISOString(), index: 2, text: '#2 加甲液' },
    ];
    const build = vi.fn(() => times);
    render(<SampleReminder label="PN 加药提醒" buildExternalTimes={build} />);
    fireEvent.click(screen.getByText('开始提醒'));

    // 等待大秒表出现（第一个 fire 触发后，scheduleNext 排程第二个，秒表持续显示）
    await waitFor(() => {
      expect(screen.getByTestId('elapsed-display')).toBeTruthy();
    });

    const display = screen.getByTestId('elapsed-display');
    expect(display.querySelector('.text-red-500')).toBeTruthy(); // 红点
    expect(display.querySelector('.animate-pulse')).toBeTruthy(); // 脉冲动画
    // 正计时：MM:SS.百分秒，两个冒号分隔段 + 红点
    expect(display.textContent).toMatch(/已提醒 1\/2 次/);
    expect(display.textContent).toMatch(/\d{2}:\d{2}/);
    // 距离下次响铃小提示
    const hint = screen.getByTestId('next-hint');
    expect(hint.textContent).toMatch(/距离下次响铃 \d{2}:\d{2}/);
    // 第二次提醒在 5500ms 后，距 < 10s 时应变红脉冲（这里 5.5s 离第二个时刻 5.5s-已用时间=~5s，应触发 imminent）
    expect(hint.className).toMatch(/animate-pulse/);
  });
});
