import { describe, it, expect } from 'vitest';
import { buildWideCsv } from './csv';
import type { Measurement } from '../db/schema';

function mk(date: string, reactorId: number, indicatorId: number, value: number, time?: string): Measurement {
  return {
    id: undefined,
    scene: 'daily',
    date,
    phase: null,
    reactorId,
    indicatorId,
    inputType: 'direct',
    sampleAbs: null,
    blankAbs: null,
    dilution: 1,
    value,
    curveId: null,
    blankOverridden: false,
    dilutionOverridden: false,
    note: '',
  };
}

const reactorCodes = new Map<number, string>([
  [1, 'R1'],
  [2, 'R2'],
]);
const indicatorNames = new Map<number, string>([
  [10, '氨氮'],
  [11, 'COD'],
]);

describe('buildWideCsv（Origin 宽表）', () => {
  it('行=日期，列=罐_指标，值=当日最后一次测量', () => {
    const rows = [
      mk('2026-09-01', 1, 10, 3.5),
      mk('2026-09-01', 2, 10, 4.2),
      mk('2026-09-02', 1, 10, 2.8),
      mk('2026-09-02', 1, 10, 2.9), // 同组最后一条 wins
    ];
    const csv = buildWideCsv(rows, reactorCodes, indicatorNames);
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
    expect(lines[0]).toBe('date,R1_氨氮,R2_氨氮');
    expect(lines[1]).toBe('2026-09-01,3.5,4.2');
    expect(lines[2]).toBe('2026-09-02,2.9,');
  });

  it('只含 scene=daily；日期按升序', () => {
    const cycle = { ...mk('2026-09-03', 1, 10, 9.9), scene: 'cycle' as const };
    const rows = [cycle, mk('2026-09-01', 1, 10, 1), mk('2026-09-02', 1, 10, 2)];
    const csv = buildWideCsv(rows, reactorCodes, indicatorNames);
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
    expect(lines).toHaveLength(3); // header + 2 个日期（cycle 被排除）
    expect(lines[1]).toBe('2026-09-01,1');
  });

  it('空数据仅输出表头', () => {
    const csv = buildWideCsv([], reactorCodes, indicatorNames);
    expect(csv.replace(/^\uFEFF/, '').trim()).toBe('date');
  });
});
