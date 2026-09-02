import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import EntryPage from './index';
import { today } from '../../lib/format';
import { saveDraft, loadDraft, clearDraft } from '../../lib/draft';

async function clearAll() {
  for (const t of db.tables) await t.clear();
  localStorage.clear();
}

/** 建一个直读指标 + R1 */
async function seedBasic() {
  const indId = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const rId = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  return { indId, rId };
}

describe('录入草稿自动保存与恢复', () => {
  beforeEach(clearAll);

  it('当日无已存数据且有草稿 → 显示「恢复草稿」提示', async () => {
    const { indId, rId } = await seedBasic();
    // 预置草稿（今天，无 DB 数据）
    saveDraft({
      date: today(),
      defaults: { [indId]: { blank: '0.012', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.284', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    // 提示条出现
    expect(await screen.findByText(/发现未保存的草稿/)).toBeTruthy();
  });

  it('点「恢复草稿」把吸光度与空白带回输入框', async () => {
    const { indId, rId } = await seedBasic();
    saveDraft({
      date: today(),
      defaults: { [indId]: { blank: '0.012', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.284', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    await screen.findByText(/发现未保存的草稿/);
    fireEvent.click(screen.getByText('恢复草稿'));

    await waitFor(() => {
      const sample = screen.getByLabelText('R1 吸光度');
      expect((sample as HTMLInputElement).value).toBe('0.284');
    });
    // 提示条消失
    expect(screen.queryByText(/发现未保存的草稿/)).toBeNull();
  });

  it('点「丢弃」清掉草稿并关闭提示', async () => {
    const { indId, rId } = await seedBasic();
    saveDraft({
      date: today(),
      defaults: { [indId]: { blank: '', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.5', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    await screen.findByText(/发现未保存的草稿/);
    fireEvent.click(screen.getByText('丢弃'));

    await waitFor(() => {
      expect(screen.queryByText(/发现未保存的草稿/)).toBeNull();
    });
    expect(loadDraft()).toBeNull();
  });

  it('当日已有已存数据时不提示恢复（避免覆盖）', async () => {
    const { indId, rId } = await seedBasic();
    // 今天已有数据
    await db.measurements.add({
      scene: 'daily', date: today(), phase: null, reactorId: rId, indicatorId: indId,
      inputType: 'absorbance', sampleAbs: 0.2, blankAbs: 0.01, dilution: 10,
      value: 3, curveId: null, blankOverridden: false, dilutionOverridden: false,
      note: '', createdAt: '',
    });
    saveDraft({
      date: today(),
      defaults: { [indId]: { blank: '0.012', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.284', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    await waitFor(() => expect(screen.queryByText(/发现未保存的草稿/)).toBeNull());
  });

  it('草稿日期与当前日期不同时不提示', async () => {
    const { indId, rId } = await seedBasic();
    const otherDay = today() === '2026-09-02' ? '2026-09-01' : '2026-09-02';
    saveDraft({
      date: otherDay,
      defaults: { [indId]: { blank: '', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.1', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    // 等待渲染稳定
    await waitFor(() => {
      expect(screen.queryByText(/发现未保存的草稿/)).toBeNull();
    });
    expect(loadDraft()).not.toBeNull(); // 草稿仍在，留给切回那天用
  });
});
