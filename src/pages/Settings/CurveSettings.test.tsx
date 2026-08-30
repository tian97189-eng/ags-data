import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import CurveSettings from './CurveSettings';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seedIndicator() {
  return db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
}

describe('CurveSettings 删除', () => {
  beforeEach(clearAll);

  it('历史曲线可删除', async () => {
    const indicatorId = await seedIndicator();
    const oldId = await db.curves.add({
      indicatorId, effectiveFrom: '2026-08-01', effectiveTo: '2026-08-10',
      k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
    });

    render(<CurveSettings />);
    await screen.findByText('删除');

    await userEvent.click(screen.getByText('删除'));
    await screen.findByText('删除标准曲线');
    const confirmBtn = screen.getAllByText('删除').pop();
    await userEvent.click(confirmBtn!);

    await waitFor(async () => {
      expect(await db.curves.get(oldId)).toBeUndefined();
    });
  });

  it('删除当前生效的公式曲线', async () => {
    const indicatorId = await seedIndicator();
    const curId = await db.curves.add({
      indicatorId, effectiveFrom: '2026-08-01', effectiveTo: null,
      k: 0, b: 0, r2: 1, points: [], batchNo: '', note: '', createdAt: '',
      formulaType: 'formula', formula: '(6.9627*(A-A0)-0.004)*D',
    });

    render(<CurveSettings />);
    await screen.findByText('删除此曲线');

    await userEvent.click(screen.getByText('删除此曲线'));
    await screen.findByText('删除标准曲线');
    const confirmBtn = screen.getAllByText('删除').pop();
    await userEvent.click(confirmBtn!);

    await waitFor(async () => {
      expect(await db.curves.get(curId)).toBeUndefined();
    });
  });
});
