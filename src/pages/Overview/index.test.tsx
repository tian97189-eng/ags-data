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
  // 清掉上个用例遗留的 geolocation stub
  try {
    delete (navigator as { geolocation?: unknown }).geolocation;
  } catch {
    /* ignore */
  }
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
    localStorage.setItem(CITY_KEY, '长沙');
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

  it('倒计时：添加事件后显示 天后/天前 + 可删除', () => {
    render(<OverviewPage />);
    // 新 UI 默认折叠表单，先点"+ 添加倒计时事件"
    fireEvent.click(screen.getByText('+ 添加倒计时事件'));
    const labelInput = screen.getByLabelText('新事件名') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: '答辩' } });
    const dateInput = screen.getByLabelText('新事件日期') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-12-30' } });
    fireEvent.click(screen.getByText('添加'));
    // 倒计时应显示 "天后" + label
    expect(screen.getByText('答辩')).toBeTruthy();
    expect(screen.getByText(/(天后|天前)/)).toBeTruthy();
    // localStorage 已写入（数组）
    const saved = JSON.parse(localStorage.getItem(COUNTDOWN_KEY) || 'null');
    expect(Array.isArray(saved)).toBe(true);
    expect(saved[0]).toMatchObject({ label: '答辩', date: '2026-12-30' });
  });

  it('笔记：textarea 输入后会存入 localStorage（防抖 300ms）', async () => {
    render(<OverviewPage />);
    const ta = screen.getByPlaceholderText(/随手写点什么/i) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '今天想到一个 idea' } });
    // 等防抖 300ms + 余量（jsdom 真实 setTimeout）
    for (let i = 0; i < 50; i++) {
      if (localStorage.getItem(NOTES_KEY) === '今天想到一个 idea') break;
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(localStorage.getItem(NOTES_KEY)).toBe('今天想到一个 idea');
  });

  it('从 localStorage 恢复笔记内容', () => {
    localStorage.setItem(NOTES_KEY, '上周的草稿');
    render(<OverviewPage />);
    const ta = screen.getByPlaceholderText(/随手写点什么/i) as HTMLTextAreaElement;
    expect(ta.value).toBe('上周的草稿');
  });
});

describe('天气与实际地点一致（默认不再写死北京）', () => {
  /** geocoding→长沙坐标；forecast→25.3°；reverse-geocode→湖南省·长沙市 */
  function mockFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('geocoding')) {
          return Promise.resolve({
            json: async () => ({ results: [{ latitude: 28.23, longitude: 112.94, name: '长沙' }] }),
          });
        }
        if (u.includes('reverse-geocode')) {
          return Promise.resolve({
            json: async () => ({ principalSubdivision: '湖南省', city: '长沙市' }),
          });
        }
        if (u.includes('forecast')) {
          return Promise.resolve({
            json: async () => ({
              current: { temperature_2m: 25.3, weather_code: 2, relative_humidity_2m: 60, wind_speed_10m: 5.1 },
            }),
          });
        }
        return Promise.resolve({ json: async () => ({}) });
      }),
    );
  }
  function stubGeolocation(lat: number, lon: number) {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: lat, longitude: lon } }),
      },
    });
  }

  it('未设置城市且未定位 → 不发天气请求，只显示引导', () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    render(<OverviewPage />);
    expect(screen.getByText(/未设置城市/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /自动定位/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('手动输入城市（长沙）→ 按坐标查当地天气并持久化', async () => {
    mockFetch();
    render(<OverviewPage />);
    fireEvent.change(screen.getByPlaceholderText(/城市名/), { target: { value: '长沙' } });
    fireEvent.click(screen.getByText('查询'));
    const temp = await screen.findByText('25°', undefined, { timeout: 3000 });
    expect(temp).toBeTruthy();
    await screen.findByText((c: string) => c.includes('长沙'), undefined, { timeout: 3000 });
    expect(localStorage.getItem(CITY_KEY)).toBe('长沙');
  });

  it('点「自动定位」→ 直接用坐标查天气（不经城市 geocoding），反查省市区显示', async () => {
    mockFetch();
    stubGeolocation(28.23, 112.94);
    render(<OverviewPage />);
    fireEvent.click(screen.getByRole('button', { name: /自动定位/ }));
    await screen.findByText('25°', undefined, { timeout: 3000 });
    const urls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('geocoding'))).toBe(false);
    expect(urls.some((u) => u.includes('forecast'))).toBe(true);
    // 反查城市名补进卡片
    await screen.findByText((c: string) => c.includes('湖南省'), undefined, { timeout: 3000 });
  });

  it('输入城市后重新点「自动定位」→ 显示当前位置（不再显示上次城市）', async () => {
    mockFetch();
    stubGeolocation(28.23, 112.94);
    localStorage.setItem(CITY_KEY, '北京'); // 模拟用户之前手动设过北京
    render(<OverviewPage />);
    // 有城市则直接加载北京天气，之后再定位应切到当前位置数据
    fireEvent.click(screen.getByRole('button', { name: /自动定位/ }));
    await screen.findByText('25°', undefined, { timeout: 3000 });
    await screen.findByText((c: string) => c.includes('湖南省'), undefined, { timeout: 3000 });
  });
});
