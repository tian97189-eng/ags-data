import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import TrashSettings from './TrashSettings';
import { trashRows } from '../../lib/trash';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('TrashSettings 回收站（设置页 · 分类恢复）', () => {
  beforeEach(clearAll);

  it('空态：显示提示文案', async () => {
    render(<TrashSettings />);
    await screen.findByText(/回收站是空的/, undefined, { timeout: 3000 });
  });

  it('按分类分组展示：数据录入 / 全周期 / 污泥浓度各自成组，组内可恢复', async () => {
    // 数据录入 daily 测量
    await db.measurements.add({ scene: 'daily', date: '2026-09-01', phase: null, reactorId: 1, indicatorId: 1, inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null, value: 3, curveId: null, blankOverridden: false, dilutionOverridden: false, note: '', createdAt: '' });
    const d = await db.measurements.toArray();
    await db.measurements.clear();
    await trashRows('measurements', d);
    // 全周期测量
    await db.measurements.add({ scene: 'cycle', date: '2026-09-01', cycleRunId: 9, time: '08:00', phase: null, reactorId: 1, indicatorId: 1, inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null, value: 5, curveId: null, blankOverridden: false, dilutionOverridden: false, note: '', createdAt: '' });
    const c = await db.measurements.toArray();
    await db.measurements.clear();
    await trashRows('measurements', c);
    // 污泥浓度
    const mId = await db.mlssRecords.add({ date: '2026-09-02', reactorId: null, paperNo: 'A1', m1: 1, m2: 2, m3: 3, m4: 4, v: 15, mlss: 1, mlvss: 1, note: '', createdAt: '' });
    const row = await db.mlssRecords.get(mId);
    await db.mlssRecords.delete(mId);
    await trashRows('mlssRecords', [row!]);

    render(<TrashSettings />);
    // 三组标题都在
    await screen.findByText('数据录入', undefined, { timeout: 3000 });
    expect(screen.getByText('全周期')).toBeTruthy();
    expect(screen.getByText('污泥浓度')).toBeTruthy();
    expect(screen.getAllByText('测量数据 · 1 条').length).toBe(2);

    // 点「恢复」→ 污泥浓度回到表里
    const restoreBtns = screen.getAllByText('恢复');
    fireEvent.click(restoreBtns[restoreBtns.length - 1]);
    await waitFor(() => {
      expect(db.mlssRecords.get(mId)).resolves.toBeTruthy();
    });
    // 组内条目消失（回收站清空该条目后）
    await waitFor(() => {
      expect(screen.queryByText('污泥浓度')).toBeNull();
    }, { timeout: 3000 });
  });

  it('「彻底删除」后条目消失且数据不回到原表', async () => {
    const mId = await db.mlssRecords.add({ date: '2026-09-02', reactorId: null, paperNo: 'A1', m1: 1, m2: 2, m3: 3, m4: 4, v: 15, mlss: 1, mlvss: 1, note: '', createdAt: '' });
    const row = await db.mlssRecords.get(mId);
    await db.mlssRecords.delete(mId);
    await trashRows('mlssRecords', [row!]);
    render(<TrashSettings />);
    await screen.findByText('污泥浓度', undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText('彻底删除'));
    await waitFor(() => {
      expect(screen.queryByText('污泥浓度')).toBeNull();
    }, { timeout: 3000 });
    expect(await db.mlssRecords.get(mId)).toBeUndefined();
  });
});
