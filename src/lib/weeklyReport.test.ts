import { describe, it, expect } from 'vitest';
import { buildWeeklyReport, recentWindow } from './weeklyReport';
import type { Measurement, Influent, Reactor, Indicator } from '../db/schema';

const reactors: Reactor[] = [
  { id: 1, code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' },
  { id: 2, code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '' },
];
const indicators: Indicator[] = [
  {
    id: 10, name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 1, refLow: null, refHigh: 8, lod: null, active: true, sortOrder: 1,
  },
  {
    id: 11, name: 'COD', category: 'basic', method: 'direct', unit: 'mg/L',
    defaultDilution: 1, refLow: null, refHigh: 50, lod: null, active: true, sortOrder: 2,
  },
];

function out(date: string, reactorId: number, indicatorId: number, value: number): Measurement {
  return {
    id: undefined, scene: 'daily', date, phase: null, reactorId, indicatorId,
    inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: 1, value,
    curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
  };
}
function inf(date: string, indicatorId: number, value: number, reactorId: number | null = null): Influent {
  return {
    id: undefined, date, mode: reactorId == null ? 'shared' : 'perReactor',
    reactorId, indicatorId, value, note: '', createdAt: '',
  } as Influent;
}

describe('buildWeeklyReport', () => {
  it('输出含数据规模、罐的去除率、超范围警告与备注', () => {
    const txt = buildWeeklyReport({
      start: '2026-08-26',
      end: '2026-09-01',
      measurements: [
        out('2026-08-28', 1, 10, 3.0),
        out('2026-08-28', 1, 10, 4.0),
        out('2026-08-30', 1, 10, 12.0), // 超 refHigh 8
        out('2026-08-30', 2, 10, 5.0),
      ],
      influents: [inf('2026-08-28', 10, 40), inf('2026-08-30', 10, 38)],
      reactors,
      indicators,
      dayNotes: new Map([['2026-08-30', 'R1 曝气故障']]),
    });

    expect(txt).toContain('实验周报（2026-08-26 ~ 2026-09-01）');
    expect(txt).toContain('4 条出水测量');
    expect(txt).toContain('【R1】');
    expect(txt).toContain('氨氮(mg/L)');
    expect(txt).toContain('去除率'); // R1：进 39 → 出均值 6.33 → ~83.8%
    expect(txt).toContain('1 次超参考'); // 12.0 > 8
    expect(txt).toContain('超参考范围');
    expect(txt).toContain('2026-08-30 R1 氨氮 = 12.00');
    expect(txt).toContain('当日备注');
    expect(txt).toContain('R1 曝气故障');
  });

  it('窗口内无数据时输出空态文字', () => {
    const txt = buildWeeklyReport({
      start: '2026-08-26',
      end: '2026-09-01',
      measurements: [],
      influents: [],
      reactors,
      indicators,
      dayNotes: new Map(),
    });
    expect(txt).toContain('0 条出水测量');
    expect(txt).toContain('【异常记录】无');
    expect(txt).toContain('【当日备注】无');
  });
});

describe('recentWindow', () => {
  it('返回含今天在内的 7 天窗口', () => {
    const now = new Date(2026, 8, 2); // 2026-09-02
    const w = recentWindow(7, now);
    expect(w.start).toBe('2026-08-27');
    expect(w.end).toBe('2026-09-02');
  });
});
