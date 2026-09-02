import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../db/schema';
import { useAppStore } from '../../store/useAppStore';
import QueryPage from './index';

async function clearAll() {
  for (const t of db.tables) await t.clear();
  localStorage.clear();
}

async function seedMeasurements() {
  const indId = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const rId = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  await db.measurements.add({
    scene: 'daily', date: '2026-09-02', phase: null, reactorId: rId, indicatorId: indId,
    inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
    value: 5.7, curveId: null, blankOverridden: false, dilutionOverridden: false,
    note: '', createdAt: '',
  });
  await db.measurements.add({
    scene: 'cycle', date: '2026-09-02', phase: 'oxic', reactorId: rId, indicatorId: indId,
    inputType: 'absorbance', sampleAbs: 0.3, blankAbs: 0.012, dilution: 10,
    value: 4.5, curveId: null, blankOverridden: false, dilutionOverridden: false,
    note: '', createdAt: '',
  });
}

describe('QueryPage 快捷筛选（问题3）', () => {
  beforeEach(clearAll);

  it('有「+ 存为快捷筛选」和「快速查找」input 入口', async () => {
    await seedMeasurements();
    render(<QueryPage />);
    await screen.findByText('导出 Excel');
    expect(screen.getByPlaceholderText('输入名字回车应用预设')).toBeTruthy();
    expect(screen.getByText('+ 存为快捷筛选')).toBeTruthy();
  });

  it('"+ 存为快捷筛选"打开保存 input，回车保存为新预设', async () => {
    await seedMeasurements();
    render(<QueryPage />);
    await screen.findByText('导出 Excel');
    fireEvent.click(screen.getByText('+ 存为快捷筛选'));
    const input = screen.getByPlaceholderText('预设名字：回车应用同名/保存为新') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '只看待近期' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('query.presets.v1') || '[]');
      expect(saved.find((p: { name: string }) => p.name === '只看待近期')).toBeTruthy();
    });
  });

  it('快速查找 input：输入同名预设回车 → 应用预设（筛选条件变化）', async () => {
    // 预先存一个预设：只查看 cycle
    localStorage.setItem(
      'query.presets.v1',
      JSON.stringify([{ name: '只看周期', f: { dateFrom: '', dateTo: '', reactorIds: [], indicatorIds: [], scene: 'cycle', phase: '', keyword: '' } }]),
    );
    await seedMeasurements();
    render(<QueryPage />);
    await screen.findByText('导出 Excel');

    // 初次默认 scene='all' 应有 2 条数据
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBe(2);
    });

    const input = screen.getByPlaceholderText('输入名字回车应用预设');
    fireEvent.change(input, { target: { value: '只看周期' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // 应用后只显示 cycle 数据（1 条）
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBe(1);
    });
  });

  it('快速查找 input：输入不存在的名字回车 → 提示去点 + 存为快捷筛选', async () => {
    await seedMeasurements();
    render(<QueryPage />);
    await screen.findByText('导出 Excel');
    const input = screen.getByPlaceholderText('输入名字回车应用预设');
    fireEvent.change(input, { target: { value: '不存在的名字' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      const list = useAppStore.getState().toasts;
      expect(list.some((t) => t.text.includes('没有叫「不存在的名字」'))).toBe(true);
    });
  });
});
