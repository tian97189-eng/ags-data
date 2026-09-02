import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { db } from '../../db/schema';
import CyclePage from './index';
import { loadAnyDraft } from '../../lib/draft';

const DRAFT_KEY = 'ags-cycle-draft';

async function clearAll() {
  for (const t of db.tables) await t.clear();
  localStorage.clear();
}

interface Seed {
  indicatorId: number;
  reactorId: number;
  cycleId: number;
}

async function seedCycle(reactorCount = 1): Promise<Seed> {
  const indicatorId = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const reactorId = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  const cycleId = await db.cycles.add({
    date: '2026-08-05', name: '周期A', startTime: '08:00', intervalMinutes: 30,
    count: 2, reactorIds: [reactorId], note: '',
  });
  void reactorCount;
  return { indicatorId, reactorId, cycleId };
}

function seedMeasurement(s: Seed, time: string, sampleAbs: number) {
  return db.measurements.add({
    scene: 'cycle', date: '2026-08-05', cycleRunId: s.cycleId, time,
    phase: null, reactorId: s.reactorId, indicatorId: s.indicatorId,
    inputType: 'absorbance', sampleAbs, blankAbs: null, dilution: 10,
    value: null, curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
  });
}

function putDraft(s: Seed, sample: string) {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      cycleId: s.cycleId,
      indicatorId: s.indicatorId,
      cells: { [`08:00:${s.reactorId}`]: { sample, dilution: '10', dilutionOverridden: false } },
      phases: {},
      blank: '',
      dilution: '10',
      savedAt: Date.now(),
    }),
  );
}

describe('Cycle 草稿（问题：全周期误关可恢复）', () => {
  beforeEach(clearAll);

  it('未保存过的周期 + 有匹配草稿 → 出现恢复条，点恢复把上次输入填回格子', async () => {
    const s = await seedCycle();
    putDraft(s, '0.31');
    render(<CyclePage />);
    // 等恢复条出现（异步加载 → hasSaved===0 → 检查草稿）
    await screen.findByText('恢复草稿', undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText('恢复草稿'));
    const input = (await screen.findByDisplayValue('0.31', undefined, { timeout: 3000 })) as HTMLInputElement;
    expect(input).toBeTruthy();
    // 草稿仍在（保存前不丢，防二次丢失）
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('该周期该指标已有保存数据 → 不出现恢复条（避免覆盖已保存）', async () => {
    const s = await seedCycle();
    await seedMeasurement(s, '08:00', 0.2);
    putDraft(s, '0.31');
    render(<CyclePage />);
    // 等几轮异步后仍无恢复条
    for (let i = 0; i < 40; i++) {
      if (screen.queryByText('恢复草稿') == null) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(screen.queryByText('恢复草稿')).toBeNull();
  });

  it('输入吸光度后（防抖）→ 草稿写入 localStorage（含周期/指标/格子）', async () => {
    const s = await seedCycle();
    render(<CyclePage />);
    // 等表格 cell input 渲染（cycle 默认选中后加载完成）
    for (let i = 0; i < 40; i++) {
      if (document.querySelectorAll('tbody input[type="number"]').length > 0) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    // 额外等加载 effect 读完 db（异步回填完成后再输入，避免被覆盖）
    await new Promise((r) => setTimeout(r, 800));
    const firstCell = document.querySelectorAll('tbody input[type="number"]')[0] as HTMLInputElement;
    expect(firstCell).toBeTruthy();
    fireEvent.change(firstCell, { target: { value: '0.42' } });
    // 等 600ms 防抖后草稿出现
    let draft = null;
    for (let i = 0; i < 40; i++) {
      draft = loadAnyDraft(DRAFT_KEY);
      const cells = (draft?.cells ?? {}) as Record<string, { sample?: string }>;
      if (Object.values(cells).some((c) => c?.sample === '0.42')) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(draft?.cycleId).toBe(s.cycleId);
    expect(draft?.indicatorId).toBe(s.indicatorId);
    expect(
      ((draft?.cells as Record<string, { sample?: string }>)[`08:00:${s.reactorId}`])?.sample,
    ).toBe('0.42');
  });

  it('点「丢弃」→ 草稿被清除且恢复条消失', async () => {
    const s = await seedCycle();
    putDraft(s, '0.31');
    render(<CyclePage />);
    await screen.findByText('恢复草稿', undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText('丢弃'));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.queryByText('恢复草稿')).toBeNull();
  });
});
