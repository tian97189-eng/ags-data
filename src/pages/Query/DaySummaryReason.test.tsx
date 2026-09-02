import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DaySummary from './DaySummary';
import { db } from '../../db/schema';
import { today } from '../../lib/format';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

async function seedAbnormal(overValue: number) {
  const indId = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: 5, lod: null, active: true, sortOrder: 1,
  });
  const rId = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  const mId = await db.measurements.add({
    scene: 'daily', date: today(), phase: null, reactorId: rId, indicatorId: indId,
    inputType: 'absorbance', sampleAbs: 0.9, blankAbs: 0.01, dilution: 10,
    value: overValue, curveId: null, blankOverridden: false, dilutionOverridden: false,
    note: '', createdAt: '',
  });
  return { indId, rId, mId };
}

describe('DaySummary 超范围原因标注（需求5）', () => {
  beforeEach(clearAll);

  it('超范围行显示可点击的「超范围」标注按钮', async () => {
    await seedAbnormal(8); // > refHigh 5
    render(<DaySummary onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /超范围/ }).length).toBeGreaterThan(0);
    });
  });

  it('点超范围 → 弹原因输入 → 保存写入该测量 note', async () => {
    const { mId } = await seedAbnormal(8);
    render(<DaySummary onClose={() => {}} />);
    await waitFor(() => screen.getAllByRole('button', { name: /超范围/ }).length > 0);
    fireEvent.click(screen.getAllByRole('button', { name: /超范围/ })[0]);

    const input = screen.getByLabelText('异常原因');
    fireEvent.change(input, { target: { value: '取样时混入颗粒物' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(async () => {
      const m = await db.measurements.get(mId);
      expect(m?.note).toBe('取样时混入颗粒物');
    });
  });

  it('已标注原因后按钮带「已注」标记', async () => {
    await seedAbnormal(8);
    const { mId } = await seedAbnormal(6);
    await db.measurements.update(mId, { note: 'R1 曝气不稳' });
    render(<DaySummary onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /已注/ }).length).toBeGreaterThan(0);
    });
  });

  it('清除原因：输入清空保存后 note 为空', async () => {
    const { mId } = await seedAbnormal(8);
    await db.measurements.update(mId, { note: '旧原因' });
    render(<DaySummary onClose={() => {}} />);
    await waitFor(() => screen.getAllByRole('button', { name: /超范围/ }).length > 0);
    fireEvent.click(screen.getAllByRole('button', { name: /超范围/ })[0]);
    const input = screen.getByLabelText('异常原因');
    expect((input as HTMLInputElement).value).toBe('旧原因');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByText('保存'));
    await waitFor(async () => {
      expect((await db.measurements.get(mId))?.note).toBe('');
    });
  });
});
