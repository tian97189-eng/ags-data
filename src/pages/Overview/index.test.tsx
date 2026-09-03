import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OverviewPage from './index';
import { today } from '../../lib/format';

const NOTES_KEY = 'overview.notes.v1';
const MOOD_KEY = 'overview.mood.v1';
const COUNTDOWN_KEY = 'overview.countdown.v1';

beforeEach(() => {
  localStorage.clear();
});

describe('OverviewPage', () => {
  it('渲染顶部 hero（含实时时钟 HH:MM:SS 与日期）', () => {
    render(<OverviewPage />);
    // 日期格式 M月D日
    expect(screen.getByText(/\d{1,2}月\d{1,2}日/)).toBeTruthy();
    // 四张卡都渲染
    expect(screen.getByText('今日心情')).toBeTruthy();
    expect(screen.getByText('倒计时')).toBeTruthy();
    expect(screen.getByText('今日一言')).toBeTruthy();
    expect(screen.getByText('随手记')).toBeTruthy();
  });

  it('显示一句中文座右铭（每天固定一句，30 句池子里选）', () => {
    render(<OverviewPage />);
    const quotes = screen.getAllByText(/“/);
    expect(quotes.length).toBeGreaterThanOrEqual(1);
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

describe('OverviewPage 今日心情（问题：删天气换成可选的今日心情）', () => {
  it('未选时：显示提示与 8 个心情选项', () => {
    render(<OverviewPage />);
    expect(screen.getByText('今天心情如何？点一个选上')).toBeTruthy();
    for (const name of ['开心', '平静', '一般', '疲惫', '焦虑', '烦躁', '不舒服', '有劲']) {
      expect(screen.getByLabelText(`心情 ${name}`)).toBeTruthy();
    }
  });

  it('点「心情 开心」→ 存 localStorage + 大字显示已选心情', () => {
    render(<OverviewPage />);
    fireEvent.click(screen.getByLabelText('心情 开心'));
    // 已选状态展示
    expect(screen.getByText(/今天也要好好的/)).toBeTruthy();
    // localStorage 写入 { date: 今天, moodId: 'great' }
    const saved = JSON.parse(localStorage.getItem(MOOD_KEY) || 'null');
    expect(saved).toEqual({ date: today(), moodId: 'great' });
  });

  it('已选过再点其它心情 → 可改（更新为烦躁）', () => {
    render(<OverviewPage />);
    fireEvent.click(screen.getByLabelText('心情 开心'));
    fireEvent.click(screen.getByLabelText('心情 烦躁'));
    const saved = JSON.parse(localStorage.getItem(MOOD_KEY) || 'null');
    expect(saved.moodId).toBe('annoyed');
  });

  it('点「清除选择」→ 回到未选状态且清空 localStorage', () => {
    render(<OverviewPage />);
    fireEvent.click(screen.getByLabelText('心情 平静'));
    fireEvent.click(screen.getByText('清除选择'));
    expect(localStorage.getItem(MOOD_KEY)).toBeNull();
    expect(screen.getByText('今天心情如何？点一个选上')).toBeTruthy();
  });

  it('昨天存过的心情：今天打开不显示已选（按日期隔离）', () => {
    const yesterday = today() === '2026-09-03' ? '2026-09-02' : '2026-09-03';
    localStorage.setItem(MOOD_KEY, JSON.stringify({ date: yesterday, moodId: 'calm' }));
    render(<OverviewPage />);
    // 今天应视为未选（显示选择提示）
    expect(screen.getByText('今天心情如何？点一个选上')).toBeTruthy();
  });
});
