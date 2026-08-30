import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DatePicker from './DatePicker';

describe('DatePicker', () => {
  it('有数据的日期用高亮标记（data-marked=true）', () => {
    const marked = new Set(['2026-08-05']);
    render(<DatePicker value="2026-08-01" markedDates={marked} onChange={() => {}} />);

    fireEvent.click(screen.getByText('2026-08-01'));

    const cell = screen.getByTitle('当天有录入数据');
    expect(cell).toHaveAttribute('data-marked', 'true');
    expect(cell.textContent).toBe('5');
  });

  it('选中日期标记 data-selected=true', () => {
    render(<DatePicker value="2026-08-01" markedDates={new Set()} onChange={() => {}} />);

    fireEvent.click(screen.getByText('2026-08-01'));

    const cells = document.querySelectorAll('[data-selected="true"]');
    expect(cells.length).toBe(1);
    expect(cells[0].textContent).toBe('1');
  });

  it('点击日期触发 onChange 并关闭', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-08-01" markedDates={new Set()} onChange={onChange} />);

    fireEvent.click(screen.getByText('2026-08-01'));
    fireEvent.click(screen.getByText('15'));

    expect(onChange).toHaveBeenCalledWith('2026-08-15');
  });

  it('切换到上个月/下个月', () => {
    render(<DatePicker value="2026-08-01" markedDates={new Set()} onChange={() => {}} />);

    fireEvent.click(screen.getByText('2026-08-01'));
    expect(screen.getByText('2026年8月')).toBeInTheDocument();

    fireEvent.click(screen.getByText('‹'));
    expect(screen.getByText('2026年7月')).toBeInTheDocument();

    fireEvent.click(screen.getByText('›'));
    expect(screen.getByText('2026年8月')).toBeInTheDocument();
  });
});
