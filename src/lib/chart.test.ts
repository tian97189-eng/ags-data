import { describe, it, expect } from 'vitest';
import { buildDailyTrend, buildCycleSeries, buildCycleOverlay } from './chart';
import type { Measurement, Reactor } from '../db/schema';

const reactors: Reactor[] = [
  { id: 1, code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' },
  { id: 2, code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '' },
];

function m(overrides: Partial<Measurement>): Measurement {
  return {
    scene: 'daily', date: '2026-08-20', phase: null, reactorId: 1, indicatorId: 1,
    inputType: 'absorbance', sampleAbs: 0.1, blankAbs: 0.01, dilution: 10, value: 10,
    curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    ...overrides,
  };
}

describe('buildDailyTrend', () => {
  it('按罐分线并按日期排序', () => {
    const rows = [
      m({ reactorId: 1, date: '2026-08-05', value: 5 }),
      m({ reactorId: 1, date: '2026-08-01', value: 20 }),
      m({ reactorId: 2, date: '2026-08-02', value: 8 }),
    ];
    const series = buildDailyTrend(rows, reactors);
    expect(series).toHaveLength(2);
    expect(series[0].name).toBe('R1');
    expect(series[0].data).toEqual([
      ['2026-08-01', 20],
      ['2026-08-05', 5],
    ]);
    expect(series[0].mean).toBeCloseTo(12.5);
    expect(series[1].data).toEqual([['2026-08-02', 8]]);
  });

  it('空值计入均值跳过', () => {
    const rows = [m({ reactorId: 1, value: 10 }), m({ reactorId: 1, value: null })];
    const series = buildDailyTrend(rows, reactors);
    expect(series[0].mean).toBe(10);
  });
});

describe('buildCycleSeries', () => {
  it('按罐分线，x 轴为时间', () => {
    const rows = [
      m({ scene: 'cycle', cycleRunId: 7, reactorId: 1, time: '08:30', value: 30 }),
      m({ scene: 'cycle', cycleRunId: 7, reactorId: 1, time: '08:00', value: 39 }),
      m({ scene: 'cycle', cycleRunId: 7, reactorId: 2, time: '08:00', value: 40 }),
    ];
    const series = buildCycleSeries(rows, reactors, 7);
    expect(series[0].data).toEqual([
      ['08:00', 39],
      ['08:30', 30],
    ]);
  });
});

describe('buildCycleOverlay', () => {
  it('同一罐多个周期叠加', () => {
    const rows = [
      m({ scene: 'cycle', cycleRunId: 1, reactorId: 1, time: '08:00', value: 39 }),
      m({ scene: 'cycle', cycleRunId: 1, reactorId: 1, time: '08:30', value: 30 }),
      m({ scene: 'cycle', cycleRunId: 2, reactorId: 1, time: '08:00', value: 20 }),
    ];
    const series = buildCycleOverlay(rows, [{ id: 1, name: '0801 周期' }, { id: 2, name: '0815 周期' }], 1);
    expect(series).toHaveLength(2);
    expect(series[0].name).toBe('0801 周期');
    expect(series[1].data).toEqual([['08:00', 20]]);
  });
});
