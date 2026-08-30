import { beforeEach, describe, it, expect } from 'vitest';
import { db, type Measurement } from '../db/schema';
import { buildExportRows, buildWorkbook } from './excel';
import * as XLSX from 'xlsx';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('buildExportRows', () => {
  beforeEach(clearAll);

  it('转成含名称与标曲追溯的行', async () => {
    const rid = await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
    const iid = await db.indicators.add({ name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L', defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1 });
    const cid = await db.curves.add({ indicatorId: iid, effectiveFrom: '2026-08-20', effectiveTo: null, k: 0.3785, b: 0.0102, r2: 0.9993, points: [], batchNo: 'A26', note: '', createdAt: '' });

    const m: Measurement = {
      scene: 'daily', date: '2026-08-25', phase: null, reactorId: rid, indicatorId: iid,
      inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
      value: 13.6, curveId: cid, blankOverridden: false, dilutionOverridden: false, note: '复测',
    };

    const rows = await buildExportRows([m]);
    expect(rows[0].罐).toBe('R1');
    expect(rows[0].指标).toBe('氨氮');
    expect(rows[0].浓度).toBe(13.6);
    expect(rows[0].标曲).toContain('2026-08-20');
    expect(rows[0].备注).toBe('复测');
  });

  it('全周期数据带时间与阶段', async () => {
    const rid = await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
    const iid = await db.indicators.add({ name: 'COD', category: 'basic', method: 'direct', unit: 'mg/L', defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 5 });
    const m: Measurement = {
      scene: 'cycle', date: '2026-08-30', cycleRunId: 1, time: '08:00', phase: 'oxic',
      reactorId: rid, indicatorId: iid, inputType: 'direct', sampleAbs: 32, blankAbs: null, dilution: null,
      value: 32, curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    };
    const rows = await buildExportRows([m]);
    expect(rows[0].类型).toBe('全周期');
    expect(rows[0].时间).toBe('08:00');
    expect(rows[0].阶段).toBe('好氧');
    expect(rows[0].吸光度).toBeNull();
  });
});

describe('buildWorkbook', () => {
  it('生成含「数据」sheet 的工作簿', () => {
    const wb = buildWorkbook([{ 日期: '2026-08-25', 类型: '日常', 时间: '', 阶段: '', 罐: 'R1', 指标: '氨氮', 吸光度: 0.284, 空白: 0.012, 稀释: 10, 浓度: 13.6, 标曲: '', 备注: '' }]);
    expect(wb.SheetNames).toContain('数据');
    const ws = wb.Sheets['数据'];
    const rows = XLSX.utils.sheet_to_json(ws);
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).罐).toBe('R1');
  });
});
