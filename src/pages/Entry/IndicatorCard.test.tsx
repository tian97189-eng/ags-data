import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, beforeEach, expect } from 'vitest';
import { db } from '../../db/schema';
import IndicatorCard from './IndicatorCard';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seedTotalNitrogen() {
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
  const total = await db.indicators.add({
    name: '总氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 3.5,
    compositeType: 'sumOf', compositeRefs: [nh4, no2, no3],
  });
  const r1 = await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
  return { nh4, no2, no3, total, r1 };
}

beforeEach(clearAll);

describe('IndicatorCard composite 指标显示', () => {
  it('总氮标题出现在卡片上', async () => {
    const { total, r1 } = await seedTotalNitrogen();
    const totalInd = (await db.indicators.get(total))!;
    render(
      <IndicatorCard
        indicator={totalInd}
        reactors={[await db.reactors.get(r1)] as any}
        date="2026-08-30"
        defaultBlank=""
        defaultDilution="1"
        cells={{ [r1]: { sample: '', dilution: '1', dilutionOverridden: false } }}
        curve={null}
        onDefaultChange={() => {}}
        onCellChange={() => {}}
      />,
    );
    expect(screen.getByText('总氮')).toBeInTheDocument();
  });

  it('composite 指标不显示吸光度输入框与稀释输入框', async () => {
    const { total, r1 } = await seedTotalNitrogen();
    const totalInd = (await db.indicators.get(total))!;
    render(
      <IndicatorCard
        indicator={totalInd}
        reactors={[await db.reactors.get(r1)] as any}
        date="2026-08-30"
        defaultBlank=""
        defaultDilution="1"
        cells={{ [r1]: { sample: '', dilution: '1', dilutionOverridden: false } }}
        curve={null}
        onDefaultChange={() => {}}
        onCellChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText('R1 吸光度')).toBeNull();
    expect(screen.queryByLabelText('R1 稀释')).toBeNull();
    expect(screen.queryByLabelText('R1 浓度')).toBeNull();
  });

  it('composite 指标显示"由 N 个指标自动求和"提示', async () => {
    const { total, r1 } = await seedTotalNitrogen();
    const totalInd = (await db.indicators.get(total))!;
    render(
      <IndicatorCard
        indicator={totalInd}
        reactors={[await db.reactors.get(r1)] as any}
        date="2026-08-30"
        defaultBlank=""
        defaultDilution="1"
        cells={{ [r1]: { sample: '', dilution: '1', dilutionOverridden: false } }}
        curve={null}
        onDefaultChange={() => {}}
        onCellChange={() => {}}
      />,
    );
    expect(screen.getByText(/由 3 个指标自动求和/)).toBeInTheDocument();
  });

  it('依赖指标都没值时显示"—"；有依赖时实时显示 sum', async () => {
    const { nh4, no2, no3, total, r1 } = await seedTotalNitrogen();
    const totalInd = (await db.indicators.get(total))!;
    const r1obj = (await db.reactors.get(r1))!;
    render(
      <IndicatorCard
        indicator={totalInd}
        reactors={[r1obj] as any}
        date="2026-08-30"
        defaultBlank=""
        defaultDilution="1"
        cells={{ [r1]: { sample: '', dilution: '1', dilutionOverridden: false } }}
        curve={null}
        onDefaultChange={() => {}}
        onCellChange={() => {}}
      />,
    );
    // 初始（无依赖值）显示 —
    await waitFor(() => {
      const cells = document.querySelectorAll('table tbody tr td');
      const valueCell = cells[cells.length - 1];
      expect(valueCell.textContent?.trim()).toBe('—');
    });

    // 录入三个依赖指标的测量
    await db.measurements.bulkAdd([
      { scene: 'daily', date: '2026-08-30', phase: null, reactorId: r1, indicatorId: nh4,
        inputType: 'absorbance', sampleAbs: 0, blankAbs: 0, dilution: 1, value: 1.5,
        curveId: null, blankOverridden: false, dilutionOverridden: false, note: '' },
      { scene: 'daily', date: '2026-08-30', phase: null, reactorId: r1, indicatorId: no2,
        inputType: 'absorbance', sampleAbs: 0, blankAbs: 0, dilution: 1, value: 0.5,
        curveId: null, blankOverridden: false, dilutionOverridden: false, note: '' },
      { scene: 'daily', date: '2026-08-30', phase: null, reactorId: r1, indicatorId: no3,
        inputType: 'absorbance', sampleAbs: 0, blankAbs: 0, dilution: 1, value: 3.0,
        curveId: null, blankOverridden: false, dilutionOverridden: false, note: '' },
    ]);

    // 实时算出 5
    await waitFor(() => {
      const cells = document.querySelectorAll('table tbody tr td');
      const valueCell = cells[cells.length - 1];
      expect(valueCell.textContent?.trim()).toBe('5');
    });
  });
});