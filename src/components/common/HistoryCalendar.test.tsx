import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HistoryCalendar from './HistoryCalendar';

describe('HistoryCalendar', () => {
  it('默认选中最新日期并渲染当日明细', () => {
    const dates = new Set(['2026-09-01', '2026-09-02']);
    render(
      <HistoryCalendar dates={dates} defaultDate="2026-09-02" countLabel="共 2 条记录">
        {(date) => <div data-testid="detail">明细-{date}</div>}
      </HistoryCalendar>,
    );
    // 默认选中 09-02
    expect(screen.getByTestId('detail').textContent).toBe('明细-2026-09-02');
  });

  it('无数据时显示空状态提示', () => {
    render(
      <HistoryCalendar dates={new Set()} countLabel="共 0 条记录">
        {(date) => <div data-testid="detail">明细-{date}</div>}
      </HistoryCalendar>,
    );
    expect(screen.getByText('还没有数据')).toBeTruthy();
  });

  it('点击日历日期后渲染该日明细', () => {
    const dates = new Set(['2026-09-01', '2026-09-15']);
    render(
      <HistoryCalendar dates={dates} defaultDate="2026-09-01" countLabel="共 2 条记录">
        {(date) => <div data-testid="detail">明细-{date}</div>}
      </HistoryCalendar>,
    );
    // 打开日历，点 15 号
    fireEvent.click(screen.getByText('2026-09-01'));
    const day15 = screen.getByText('15');
    fireEvent.click(day15);
    expect(screen.getByTestId('detail').textContent).toBe('明细-2026-09-15');
  });
});
