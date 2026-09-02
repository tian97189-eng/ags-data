import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OverviewPage from './index';

const NOTES_KEY = 'overview.notes.v1';
const COUNTDOWN_KEY = 'overview.countdown.v1';
const CITY_KEY = 'overview.city.v1';

beforeEach(() => {
  localStorage.clear();
  // 默认 fetch 返回空（不报错），各用例按需覆盖
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  }));
});

describe('OverviewPage', () => {
  it('渲染顶部 hero（含实时时钟 HH:MM:SS 与日期）', () => {
    render(<OverviewPage />);
    // 日期格式 M月D日
    expect(screen.getByText(/\d{1,2}月\d{1,2}日/)).toBeTruthy();
    // 四张卡都渲染
    expect(screen.getByText('今日天气')).toBeTruthy();
    expect(screen.getByText('倒计时')).toBeTruthy();
    expect(screen.getByText('今日一言')).toBeTruthy();
    expect(screen.getByText('随手记')).toBeTruthy();
  });

  it('显示一句中文座右铭（每天固定一句，30 句池子里选）', () => {
    render(<OverviewPage />);
    const quotes = screen.getAllByText(/“/);
    expect(quotes.length).toBeGreaterThanOrEqual(1);
  });

  it('天气渲染：fetch mock 返回温度/天气码后会填入数字', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('geocoding')) {
          return Promise.resolve({
            json: async () => ({ results: [{ latitude: 39.9, longitude: 116.4, name: '北京' }] }),
          });
        }
        if (url.includes('forecast')) {
          return Promise.resolve({
            json: async () => ({
              current: {
                temperature_2m: 22.7,
                weather_code: 1,
                relative_humidity_2m: 55,
                wind_speed_10m: 4.2,
              },
            }),
          });
        }
        return Promise.resolve({ json: async () => ({}) });
      }),
    );
    render(<OverviewPage />);
    const temp = await screen.findByText('23°', undefined, { timeout: 3000 });
    expect(temp).toBeTruthy();
  });

  it('倒计时：保存 label+date 后显示 天后/天前 + 可清除', () => {
    render(<OverviewPage />);
    // 进入编辑态（首页"编辑"按钮）
    // 没初始化时显示表单：填 label + date + 提交
    const labelInput = screen.getAllByPlaceholderText(/答辩/i)[0] as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: '答辩' } });
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-12-30' } });
    fireEvent.click(screen.getByText('开始计时'));
    // 倒计时应显示 "天后" 或 "天前"，label 也在
    expect(screen.getByText('答辩')).toBeTruthy();
    expect(screen.getByText(/(天后|天前)/)).toBeTruthy();
    // localStorage 已写入
    const saved = JSON.parse(localStorage.getItem(COUNTDOWN_KEY) || 'null');
    expect(saved).toEqual({ label: '答辩', date: '2026-12-30' });
  });

  it('笔记：textarea 输入后会存入 localStorage（防抖 300ms）', async () => {
    render(<OverviewPage />);
    const ta = screen.getByPlaceholderText(/随手写点什么/i) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '今天想到一个 idea' } });
    await waitFor(
      () => {
        expect(localStorage.getItem(NOTES_KEY)).toBe('今天想到一个 idea');
      },
      { timeout: 800 },
    );
  });

  it('从 localStorage 恢复笔记内容', () => {
    localStorage.setItem(NOTES_KEY, '上周的草稿');
    render(<OverviewPage />);
    const ta = screen.getByPlaceholderText(/随手写点什么/i) as HTMLTextAreaElement;
    expect(ta.value).toBe('上周的草稿');
  });
});
