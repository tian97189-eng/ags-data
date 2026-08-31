import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from './db/schema';

// ECharts 需要 canvas，mock 成占位 div
vi.mock('echarts-for-react', () => ({
  default: (props: any) => <div data-testid="echart" data-option={JSON.stringify(props.option ?? {})} />,
}));

// 让「统计分析」页必定崩溃，用来验证错误边界兜底
vi.mock('./pages/Stats/index', () => ({
  default: () => {
    throw new Error('注入的崩溃');
  },
}));

const { default: App } = await import('./App');

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('App 错误边界集成', () => {
  beforeEach(async () => {
    await clearAll();
    window.location.hash = '#/entry';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('某页面崩溃时，左侧导航仍然可用（不再整页白屏卡死）', async () => {
    render(<App />);
    // 左侧导航的「数据录入」链接（href 指向 #/entry）
    await screen.findAllByText('数据录入');

    // 切到会崩溃的「统计分析」
    window.location.hash = '#/stats';
    await waitFor(() => {
      expect(screen.getByText('这个页面出错了')).toBeTruthy();
    });

    // 关键：左侧导航还在，能点「数据录入」切走
    const navEntry = screen.getAllByRole('link', { name: '数据录入' })[0];
    fireEvent.click(navEntry);

    await waitFor(() => {
      expect(screen.queryByText('这个页面出错了')).toBeNull();
    });
  });

  it('崩溃页提供「返回数据录入」按钮且可点击跳回', async () => {
    render(<App />);
    await screen.findAllByText('数据录入');

    window.location.hash = '#/stats';
    await waitFor(() => screen.getByText('返回数据录入'));

    fireEvent.click(screen.getByText('返回数据录入'));
    expect(window.location.hash).toBe('#/entry');
  });
});
