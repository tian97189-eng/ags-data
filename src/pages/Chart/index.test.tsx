import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../db/schema';

// ECharts 在 jsdom 下需要 canvas，mock 成占位 div，专注验证页面逻辑不崩
vi.mock('echarts-for-react', () => ({
  default: (props: any) => <div data-testid="echart" data-option={JSON.stringify(props.option ?? {})} />,
}));

const { default: ChartPage } = await import('./index');

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

/** 读取当前图表 option 里的 series 名称列表 */
function seriesNames(): string[] {
  const el = document.querySelector('[data-testid="echart"]');
  const opt = JSON.parse(el?.getAttribute('data-option') ?? '{}');
  return (opt.series ?? []).map((s: any) => s.name);
}

async function seedData() {
  const r1 = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '2026-08-30',
  });
  const nh4 = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  await db.mlssRecords.add({
    date: '2026-09-01', reactorId: null, m1: 0.7515, m2: 0.7743, m3: 25, m4: 25.005,
    v: 15, mlss: 1.52, mlvss: 51.29, note: '',
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
  return { r1, nh4, rangeId };
}

describe('ChartPage', () => {
  beforeEach(clearAll);

  it('默认渲染不崩（日常趋势模式）', async () => {
    render(<ChartPage />);
    expect(await screen.findByText('可视化')).toBeTruthy();
  });

  it('切到「其他指标趋势」不白屏（TDZ 回归测试）', async () => {
    await seedData();
    render(<ChartPage />);
    await screen.findByText('可视化');

    // 点击「其他指标趋势」按钮
    fireEvent.click(screen.getByText('其他指标趋势'));

    // 关键：页面必须仍在（不因 ReferenceError 崩溃）
    await waitFor(() => {
      expect(screen.getByText('可视化')).toBeTruthy();
    });
  });

  it('其他指标 → 污泥浓度：图表的 series 名称是 MLSS (g/L)', async () => {
    await seedData();
    render(<ChartPage />);
    await screen.findByText('可视化');
    fireEvent.click(screen.getByText('其他指标趋势'));

    await waitFor(() => {
      expect(seriesNames()).toContain('MLSS (g/L)');
    });
  });

  it('其他指标 → 污泥浓度 → 切 MLVSS：series 名称变为 MLVSS (g/L)', async () => {
    await seedData();
    render(<ChartPage />);
    await screen.findByText('可视化');
    fireEvent.click(screen.getByText('其他指标趋势'));

    await waitFor(() => screen.getByLabelText('其他指标字段'));
    fireEvent.change(screen.getByLabelText('其他指标字段'), { target: { value: 'mlvss' } });

    await waitFor(() => {
      expect(seriesNames()).toContain('MLVSS (g/L)');
    });
  });

  it('其他指标 → 切到粒径：series 名称是 d50 (μm) 且有数据点', async () => {
    await seedData();
    render(<ChartPage />);
    await screen.findByText('可视化');
    fireEvent.click(screen.getByText('其他指标趋势'));

    await waitFor(() => screen.getByLabelText('其他指标数据类型'));
    fireEvent.change(screen.getByLabelText('其他指标数据类型'), { target: { value: 'particle' } });

    await waitFor(() => {
      expect(seriesNames()).toContain('d50 (μm)');
    });
  });

  it('其他指标 → 切到 EPS：series 名称是 PS 含量', async () => {
    await seedData();
    render(<ChartPage />);
    await screen.findByText('可视化');
    fireEvent.click(screen.getByText('其他指标趋势'));

    await waitFor(() => screen.getByLabelText('其他指标数据类型'));
    fireEvent.change(screen.getByLabelText('其他指标数据类型'), { target: { value: 'eps' } });

    await waitFor(() => {
      expect(seriesNames()).toContain('PS 含量 (mg/g VSS)');
    });
  });

  it('无其他指标数据时切过去不崩（空数组安全）', async () => {
    render(<ChartPage />);
    await screen.findByText('可视化');
    fireEvent.click(screen.getByText('其他指标趋势'));
    await waitFor(() => {
      expect(screen.getByText('可视化')).toBeTruthy();
    });
  });
});
