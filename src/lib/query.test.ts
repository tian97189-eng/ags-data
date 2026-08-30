import { describe, it, expect } from 'vitest';
import { matchFilter, sortMeasurements } from './query';
import type { Measurement } from '../db/schema';

function makeMeasurement(overrides: Partial<Measurement>): Measurement {
  return {
    scene: 'daily', date: '2026-08-20', phase: null, reactorId: 1, indicatorId: 1,
    inputType: 'absorbance', sampleAbs: 0.1, blankAbs: 0.01, dilution: 10, value: 10,
    curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    ...overrides,
  };
}

describe('matchFilter', () => {
  it('无筛选条件全部通过', () => {
    expect(matchFilter(makeMeasurement({}), {})).toBe(true);
  });

  it('日期范围', () => {
    const m = makeMeasurement({ date: '2026-08-20' });
    expect(matchFilter(m, { dateFrom: '2026-08-01', dateTo: '2026-08-31' })).toBe(true);
    expect(matchFilter(m, { dateFrom: '2026-08-21' })).toBe(false);
    expect(matchFilter(m, { dateTo: '2026-08-19' })).toBe(false);
  });

  it('反应器筛选', () => {
    const m = makeMeasurement({ reactorId: 2 });
    expect(matchFilter(m, { reactorIds: [1, 2] })).toBe(true);
    expect(matchFilter(m, { reactorIds: [1] })).toBe(false);
  });

  it('指标筛选', () => {
    const m = makeMeasurement({ indicatorId: 3 });
    expect(matchFilter(m, { indicatorIds: [3] })).toBe(true);
    expect(matchFilter(m, { indicatorIds: [1, 2] })).toBe(false);
  });

  it('场景筛选', () => {
    expect(matchFilter(makeMeasurement({ scene: 'daily' }), { scene: 'daily' })).toBe(true);
    expect(matchFilter(makeMeasurement({ scene: 'cycle' }), { scene: 'daily' })).toBe(false);
    expect(matchFilter(makeMeasurement({ scene: 'cycle' }), { scene: 'all' })).toBe(true);
  });

  it('阶段筛选', () => {
    expect(matchFilter(makeMeasurement({ phase: 'oxic' }), { phase: 'oxic' })).toBe(true);
    expect(matchFilter(makeMeasurement({ phase: 'anoxic' }), { phase: 'oxic' })).toBe(false);
  });

  it('关键词搜索备注', () => {
    expect(matchFilter(makeMeasurement({ note: '复测数据' }), { keyword: '复测' })).toBe(true);
    expect(matchFilter(makeMeasurement({ note: '' }), { keyword: '复测' })).toBe(false);
  });
});

describe('sortMeasurements', () => {
  const rows = [
    makeMeasurement({ date: '2026-08-10', value: 5 }),
    makeMeasurement({ date: '2026-08-01', value: 20 }),
    makeMeasurement({ date: '2026-08-05', value: null }),
  ];

  it('按日期升序', () => {
    const s = sortMeasurements(rows, 'date', 'asc');
    expect(s.map((r) => r.date)).toEqual(['2026-08-01', '2026-08-05', '2026-08-10']);
  });

  it('按浓度降序，null 排最后', () => {
    const s = sortMeasurements(rows, 'value', 'desc');
    expect(s[0].value).toBe(20);
    expect(s[s.length - 1].value).toBeNull();
  });
});
