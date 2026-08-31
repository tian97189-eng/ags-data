import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { db } from '../../db/schema';

// ECharts 在 jsdom 下需要 canvas，mock 成占位 div
vi.mock('echarts-for-react', () => ({
  default: (props: any) => <div data-testid="echart" data-option={JSON.stringify(props.option ?? {})} />,
}));

const { default: StatsPage } = await import('./index');

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

async function seedData() {
  await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '2026-08-30',
  });
  const nh4 = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  // 污泥浓度：两条，便于验证 n=2 与均值
  await db.mlssRecords.add({
    date: '2026-09-01', reactorId: null, m1: 0.75, m2: 0.77, m3: 25, m4: 25.005,
    v: 15, mlss: 1.5, mlvss: 51.2, note: '',
  });
  await db.mlssRecords.add({
    date: '2026-09-02', reactorId: null, m1: 0.75, m2: 0.79, m3: 25, m4: 25.005,
    v: 15, mlss: 2.5, mlvss: 52.2, note: '',
  });
  const rangeId = await db.particleSizeRanges.add({
    label: '50-100', min: 50, max: 100, mid: 75, sortOrder: 1, active: true,
  });
  await db.particleSizeRecords.add({
    date: '2026-09-01', rangeId, paperWeight: 1, sampleWeight: 3, dryWeight: 2,
    percent: 100, contribution: 75, note: '',
  });
  await db.epsRecords.add({
    date: '2026-09-01', reactorId: null, psContent: 12.5, pnContent: 25, pnPsRatio: 2, note: '',
  });
  return { nh4 };
}

describe('StatsPage', () => {
  beforeEach(clearAll);

  it('渲染统计分析页不白屏（statsDescribe 未导入回归测试）', async () => {
    await seedData();
    render(<StatsPage />);
    expect(await screen.findByText('统计分析')).toBeTruthy();
    // 其他指标统计卡片必须渲染出来
    expect(await screen.findByText(/其他指标统计/)).toBeTruthy();
  });

  it('其他指标统计表展示 MLSS / MLVSS / d50 / PS / PN / PN-PS 六行', async () => {
    await seedData();
    render(<StatsPage />);
    await screen.findByText(/其他指标统计/);
    for (const name of [
      'MLSS (g/L)',
      'MLVSS (g/L)',
      '粒径 d50 (μm)',
      'PS 含量 (mg/g VSS)',
      'PN 含量 (mg/g VSS)',
      'PN/PS 比',
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('MLSS 有 2 条数据时，n=2 且均值=2.00', async () => {
    await seedData();
    render(<StatsPage />);
    await screen.findByText(/其他指标统计/);

    await waitFor(() => {
      const row = screen.getByText('MLSS (g/L)').closest('tr')!;
      const cells = Array.from(row.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
      expect(cells[0]).toBe('MLSS (g/L)');
      expect(cells[1]).toBe('2'); // n
      expect(Number(cells[2])).toBeCloseTo(2.0, 2); // mean = (1.5+2.5)/2
    });
  });

  it('无其他指标数据时页面仍渲染（空数组安全）', async () => {
    render(<StatsPage />);
    expect(await screen.findByText('统计分析')).toBeTruthy();
    await waitFor(() => {
      const row = screen.getByText('MLSS (g/L)').closest('tr')!;
      const cells = Array.from(row.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
      expect(cells[1]).toBe('0'); // n = 0
    });
  });
});
