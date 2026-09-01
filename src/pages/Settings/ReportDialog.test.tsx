import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportDialog from './ReportDialog';
import { db } from '../../db/schema';
import { seedIfEmpty } from '../../db/seed';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';

const mocks = vi.hoisted(() => ({
  renderTrendCharts: vi.fn(),
  buildDocx: vi.fn(),
  saveAndShare: vi.fn(),
}));

vi.mock('../../lib/reportCharts', () => ({
  renderTrendCharts: mocks.renderTrendCharts,
}));
vi.mock('../../lib/reportDocx', () => ({
  buildDocx: mocks.buildDocx,
}));
vi.mock('../../lib/share', () => ({
  saveAndShare: mocks.saveAndShare,
}));

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seedOneDay(nh4Value: number, doValue: number) {
  await seedIfEmpty();
  const nh4 = (await db.indicators.where('name').equals('氨氮').first())!;
  const doInd = (await db.indicators.where('name').equals('DO').first())!;
  const r1 = (await db.reactors.where('code').equals('R1').first())!;
  for (const [ind, v] of [
    [nh4, nh4Value],
    [doInd, doValue],
  ] as const) {
    await db.measurements.add({
      scene: 'daily',
      date: today(), // 用今天（本月内），ReportDialog 默认统计本月，避免跨月导致 0 条
      phase: null,
      reactorId: r1.id!,
      indicatorId: ind.id!,
      inputType: 'direct',
      sampleAbs: null,
      blankAbs: null,
      dilution: null,
      value: v,
      curveId: null,
      blankOverridden: false,
      dilutionOverridden: false,
      note: '',
    });
  }
}

describe('ReportDialog', () => {
  beforeEach(async () => {
    await clearAll();
    const t = today();
    const dateFrom = `${t.slice(0, 7)}-01`;
    mocks.renderTrendCharts.mockReset().mockResolvedValue([null]);
    mocks.buildDocx.mockReset().mockResolvedValue({ base64: 'UEsDBQAAAAA=', filename: `AGS实验报告-${dateFrom}~${t}.docx` });
    mocks.saveAndShare.mockReset().mockResolvedValue({ ok: true, method: 'web' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({ toasts: [] });
  });

  it('打开时默认全选罐和指标', async () => {
    await seedOneDay(10, 6);
    render(<ReportDialog open onClose={() => {}} />);

    expect(await screen.findByText('生成 Word 实验报告')).toBeTruthy();
    await waitFor(() => {
      // 默认选中全部：R1 + 氨氮/DO 的 label 都有选中样式
      expect(screen.getByText('R1').className).toContain('bg-teal-50');
      expect(screen.getByText('氨氮').className).toContain('bg-teal-50');
      expect(screen.getByText('DO').className).toContain('bg-teal-50');
    });
  });

  it('点击生成：收集数据 → 画图 → 组 docx → 保存，成功后关闭并提示', async () => {
    await seedOneDay(10, 6);
    const t = today();
    const dateFrom = `${t.slice(0, 7)}-01`;
    const onClose = vi.fn();
    render(<ReportDialog open onClose={onClose} />);
    await screen.findByText('生成 Word 实验报告');
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '生成报告' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));

    await waitFor(() => {
      expect(mocks.buildDocx).toHaveBeenCalledTimes(1);
    });
    expect(mocks.renderTrendCharts).toHaveBeenCalledTimes(1);
    expect(mocks.buildDocx).toHaveBeenCalledWith(
      expect.objectContaining({ dailyCount: 2, dateFrom }),
      [null],
    );
    expect(mocks.saveAndShare).toHaveBeenCalledWith(
      expect.objectContaining({ filename: `AGS实验报告-${dateFrom}~${t}.docx`, encoding: 'base64' }),
    );
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const toasts = useAppStore.getState().toasts;
    expect(toasts.some((t) => t.text.includes('报告已生成'))).toBe(true);
  });

  it('时间段内没有数据：提示且不生成', async () => {
    await seedOneDay(10, 6); // 数据在 8-01，但把区间改为 8-10 以后
    render(<ReportDialog open onClose={() => {}} />);
    await screen.findByText('生成 Word 实验报告');
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '生成报告' }) as HTMLButtonElement).disabled).toBe(false);
    });

    const dates = screen.getAllByLabelText(/日期$/);
    // dates[0] = 起始日期，dates[1] = 结束日期
    fireEvent.change(dates[0], { target: { value: '2026-08-10' } });
    fireEvent.change(dates[1], { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));

    await waitFor(() => {
      const toasts = useAppStore.getState().toasts;
      expect(toasts.some((t) => t.text.includes('没有日常数据'))).toBe(true);
    });
    expect(mocks.buildDocx).not.toHaveBeenCalled();
    expect(mocks.saveAndShare).not.toHaveBeenCalled();
  });

  it('清空罐选择后生成按钮禁用', async () => {
    await seedOneDay(10, 6);
    render(<ReportDialog open onClose={() => {}} />);
    await screen.findByText('生成 Word 实验报告');
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '生成报告' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getAllByText('清空')[0]); // 罐区的清空按钮
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '生成报告' }) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('取消关闭对话框', () => {
    const onClose = vi.fn();
    render(<ReportDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalled();
  });
});
