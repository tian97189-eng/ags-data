import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import CyclePage from './index';
async function clearAll() {
  for (const t of db.tables) await t.clear();
}

/** 建三氮 + 总氮(composite) + R1 + 一个 2 个时间点的周期 */
async function seedComposite() {
  const nh4 = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const no3 = await db.indicators.add({
    name: '硝态氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 5, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 2,
  });
  const no2 = await db.indicators.add({
    name: '亚硝态氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 5, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 3,
  });
  const tn = await db.indicators.add({
    name: '总氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 3.5,
    compositeType: 'sumOf', compositeRefs: [nh4, no2, no3],
  });
  const r1 = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  const cycleId = await db.cycles.add({
    date: '2026-08-05', name: '周期A', startTime: '08:00', intervalMinutes: 30,
    count: 2, reactorIds: [r1], note: '',
  });

  // 三氮在周期里的已保存浓度：T1=08:00, T2=08:30
  // T1: 氨氮 10 + 硝态 5 + 亚硝 2 = 17
  // T2: 氨氮 8 + 硝态 4 + 亚硝 1 = 13
  const put = (indicatorId: number, time: string, value: number) =>
    db.measurements.add({
      scene: 'cycle', date: '2026-08-05', cycleRunId: cycleId, time,
      phase: null, reactorId: r1, indicatorId,
      inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null,
      value, curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    });
  await put(nh4, '08:00', 10);
  await put(no3, '08:00', 5);
  await put(no2, '08:00', 2);
  await put(nh4, '08:30', 8);
  await put(no3, '08:30', 4);
  await put(no2, '08:30', 1);

  return { nh4, no3, no2, tn, r1, cycleId };
}

describe('CyclePage 总氮（composite）', () => {
  beforeEach(clearAll);

  it('总氮出现在指标切换 tab', async () => {
    await seedComposite();
    render(<CyclePage />);
    expect(await screen.findByText('总氮')).toBeTruthy();
  });

  it('切到总氮 tab：无输入框，每格显示三氮和（08:00→17，08:30→13）', async () => {
    await seedComposite();
    render(<CyclePage />);
    await screen.findByText('总氮');
    screen.getByText('总氮').click();

    // 17 和 13 会同时出现在主表格与底部统计卡，用 getAllByText 断言至少存在
    await waitFor(() => {
      expect(screen.getAllByText('17').length).toBeGreaterThan(0);
      expect(screen.getAllByText('13').length).toBeGreaterThan(0);
    });
    // 没有可输入的格子（composite 只读）
    const inputs = document.querySelectorAll('table input');
    expect(inputs.length).toBe(0);
  });

  it('切到总氮 tab 不显示空白/稀释输入', async () => {
    await seedComposite();
    render(<CyclePage />);
    await screen.findByText('总氮');
    screen.getByText('总氮').click();
    await waitFor(() => expect(screen.getAllByText('17').length).toBeGreaterThan(0));
    // 顶部空白/稀释输入框不应存在
    expect(document.querySelector('input')).toBeNull();
  });

  it('保存后：总氮 measurement 记录 value=三氮和（T1=17，T2=13）', async () => {
    const { tn, r1, cycleId } = await seedComposite();
    render(<CyclePage />);
    await screen.findByText('总氮');
    screen.getByText('总氮').click();
    await waitFor(() => expect(screen.getAllByText('17').length).toBeGreaterThan(0));

    screen.getByText('保存').click();

    await waitFor(async () => {
      const list = await db.measurements
        .where('cycleRunId')
        .equals(cycleId)
        .filter((m) => m.indicatorId === tn)
        .toArray();
      expect(list).toHaveLength(2);
      const t1 = list.find((m) => m.time === '08:00');
      const t2 = list.find((m) => m.time === '08:30');
      expect(t1?.value).toBe(17);
      expect(t2?.value).toBe(13);
      expect(t1?.inputType).toBe('direct');
      expect(t1?.reactorId).toBe(r1);
    });
  });
});
