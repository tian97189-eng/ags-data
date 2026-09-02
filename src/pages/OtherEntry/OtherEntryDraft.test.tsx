import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { db } from '../../db/schema';
import OtherEntryPage from './index';
import { today } from '../../lib/format';
import { loadAnyDraft } from '../../lib/draft';

const DRAFT_KEY = 'ags-other-draft';

async function clearAll() {
  for (const t of db.tables) await t.clear();
  localStorage.clear();
}

async function seedOther() {
  const indicatorId = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const reactorId = await db.otherReactors.add({
    code: 'B1', name: 'B1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  return { indicatorId, reactorId };
}

describe('OtherEntry 草稿（问题：他人数据误关可恢复）', () => {
  beforeEach(clearAll);

  it('当日无已存记录 + 有匹配草稿 → 出现恢复条，点恢复填回格子', async () => {
    const { indicatorId, reactorId } = await seedOther();
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        date: today(),
        cells: { [`${reactorId}:${indicatorId}`]: { sample: '0.35', blank: '', dilution: '' } },
        savedAt: Date.now(),
      }),
    );
    render(<OtherEntryPage />);
    await screen.findByText('恢复草稿', undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText('恢复草稿'));
    const input = (await screen.findByDisplayValue('0.35', undefined, { timeout: 3000 })) as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('输入吸光度后（防抖）→ 草稿写入 localStorage（绑定当天日期）', async () => {
    const { indicatorId, reactorId } = await seedOther();
    render(<OtherEntryPage />);
    // 他人罐/指标渲染后，按 aria-label 找到吸光度输入
    const input = (await screen.findByLabelText('氨氮 B1 吸光度', undefined, { timeout: 3000 })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.28' } });
    let draft = null;
    for (let i = 0; i < 40; i++) {
      draft = loadAnyDraft(DRAFT_KEY);
      const cells = (draft?.cells ?? {}) as Record<string, { sample?: string }>;
      if (cells[`${reactorId}:${indicatorId}`]?.sample === '0.28') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(draft?.date).toBe(today());
    expect(
      ((draft?.cells as Record<string, { sample?: string }>)[`${reactorId}:${indicatorId}`])?.sample,
    ).toBe('0.28');
  });

  it('当日已有保存记录 → 不出现恢复条（避免覆盖已保存）', async () => {
    const { indicatorId, reactorId } = await seedOther();
    await db.otherMeasurements.add({
      date: today(), reactorId, indicatorId,
      inputType: 'absorbance', sampleAbs: 0.5, blankAbs: null, dilution: 10,
      value: null, curveId: null, note: '', createdAt: '',
    });
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        date: today(),
        cells: { [`${reactorId}:${indicatorId}`]: { sample: '0.35', blank: '', dilution: '' } },
        savedAt: Date.now(),
      }),
    );
    render(<OtherEntryPage />);
    for (let i = 0; i < 40; i++) {
      if (screen.queryByText('恢复草稿') == null) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(screen.queryByText('恢复草稿')).toBeNull();
  });
});
