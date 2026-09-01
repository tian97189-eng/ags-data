import { beforeEach, describe, it, expect } from 'vitest';
import { db, type Measurement } from '../db/schema';
import {
  buildExportRows,
  buildFullWorkbook,
  buildMLSSExport,
  buildParticleExport,
  buildEPSExport,
  buildWorkbook,
} from './excel';
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

describe('buildExportRows 过滤条件', () => {
  beforeEach(clearAll);

  async function seed() {
    const r1 = await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
    const r2 = await db.reactors.add({ code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '' });
    const i1 = await db.indicators.add({ name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L', defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1 });
    const i2 = await db.indicators.add({ name: 'COD', category: 'basic', method: 'direct', unit: 'mg/L', defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 5 });
    const base = (reactorId: number, indicatorId: number, date: string): Measurement => ({
      scene: 'daily', date, phase: null, reactorId, indicatorId,
      inputType: 'absorbance', sampleAbs: 0, blankAbs: 0, dilution: 1, value: 1,
      curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    });
    const ms = [
      base(r1, i1, '2026-08-25'),
      base(r1, i2, '2026-08-25'),
      base(r2, i1, '2026-08-25'),
      base(r1, i1, '2026-08-30'),
      base(r2, i2, '2026-08-30'),
    ];
    return { r1, r2, i1, i2, ms };
  }

  it('默认无过滤 → 全部导出', async () => {
    const { ms } = await seed();
    const rows = await buildExportRows(ms);
    expect(rows).toHaveLength(5);
  });

  it('按日期范围过滤（含端点）', async () => {
    const { ms } = await seed();
    const rows = await buildExportRows(ms, { dateFrom: '2026-08-25', dateTo: '2026-08-25' });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.日期 === '2026-08-25')).toBe(true);
  });

  it('只设 dateFrom → 大于等于该日期', async () => {
    const { ms } = await seed();
    const rows = await buildExportRows(ms, { dateFrom: '2026-08-30' });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.日期 === '2026-08-30')).toBe(true);
  });

  it('按罐 id 过滤', async () => {
    const { ms, r1 } = await seed();
    const rows = await buildExportRows(ms, { reactorIds: [r1] });
    expect(rows).toHaveLength(3); // 08-25: R1/i1 + R1/i2; 08-30: R1/i1
    expect(rows.every((r) => r.罐 === 'R1')).toBe(true);
  });

  it('按指标 id 过滤', async () => {
    const { ms, i2 } = await seed();
    const rows = await buildExportRows(ms, { indicatorIds: [i2] });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.指标 === 'COD')).toBe(true);
  });

  it('多条件叠加：日期+罐+指标', async () => {
    const { ms, r1, i1 } = await seed();
    const rows = await buildExportRows(ms, {
      dateFrom: '2026-08-25', dateTo: '2026-08-25', reactorIds: [r1], indicatorIds: [i1],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].罐).toBe('R1');
    expect(rows[0].指标).toBe('氨氮');
    expect(rows[0].日期).toBe('2026-08-25');
  });

  it('空数组的 reactorIds 视作"不限"（不传=全部）', async () => {
    const { ms } = await seed();
    const rows = await buildExportRows(ms, { reactorIds: [] });
    expect(rows).toHaveLength(5);
  });
});

describe('buildMLSSExport', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
  });
  it('把 mlssRecords 转成导出行（含日期过滤）', async () => {
    await db.mlssRecords.bulkAdd([
      { date: '2026-08-30', reactorId: null, paperNo: 'A-1', m1: 0.75, m2: 0.77, m3: 25, m4: 25.01, v: 15, mlss: 1.333, mlvss: 50.667, note: '', createdAt: '' },
      { date: '2026-09-05', reactorId: null, paperNo: 'A-2', m1: 0.74, m2: 0.76, m3: 25, m4: 25.01, v: 15, mlss: 1.333, mlvss: 50.667, note: '', createdAt: '' },
    ]);
    const all = await buildMLSSExport();
    expect(all).toHaveLength(2);
    expect(all[0].滤纸编号).toBe('A-2'); // 按日期降序
    expect(all[0].MLSS).toBeCloseTo(1.333, 3);

    const ranged = await buildMLSSExport({ dateFrom: '2026-09-01' });
    expect(ranged).toHaveLength(1);
    expect(ranged[0].日期).toBe('2026-09-05');
  });
});

describe('buildParticleExport', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
  });
  it('把粒径记录转成导出行（含区间标签）', async () => {
    const r1 = await db.particleSizeRanges.add({ from: 50, to: 100, mid: 75, sortOrder: 1 });
    const r2 = await db.particleSizeRanges.add({ from: 100, to: 200, mid: 150, sortOrder: 2 });
    await db.particleSizeRecords.bulkAdd([
      { date: '2026-08-30', reactorId: null, rangeId: r1, paperWeight: 0.7, sampleWeight: 0.75, dryWeight: 0.05, percent: 33.33, contribution: 25, note: '', createdAt: '' },
      { date: '2026-08-30', reactorId: null, rangeId: r2, paperWeight: 0.7, sampleWeight: 0.8, dryWeight: 0.1, percent: 66.67, contribution: 100, note: '', createdAt: '' },
    ]);
    const rows = await buildParticleExport();
    expect(rows).toHaveLength(2);
    // 按主键降序返回（r2 在前），区间标签对应 r2
    expect(rows[0].区间).toBe('100-200 μm');
    expect(rows[1].区间).toBe('50-100 μm');
    expect(rows[1].中位径).toBe(75);
  });
});

describe('buildEPSExport', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
  });
  it('把 EPS 记录转成导出行（含 PN/PS 比）', async () => {
    await db.epsRecords.bulkAdd([
      {
        date: '2026-08-30', reactorId: null, sampleCode: 'R1-D1', vssMg: 100,
        psSampleAbs: 0.55, psBlankAbs: 0.05, psDilution: 10, psCurveId: null,
        pnSampleAbs: 0.33, pnBlankAbs: 0.01, pnDilution: 5, pnCurveId: null,
        psConc: 50, pnConc: 30, extractVolume: 10,
        psContent: 5, pnContent: 3, pnPsRatio: 0.6, note: '', createdAt: '',
      },
    ]);
    const rows = await buildEPSExport();
    expect(rows).toHaveLength(1);
    expect(rows[0].样品编号).toBe('R1-D1');
    expect(rows[0].PS含量).toBeCloseTo(5, 4);
    expect(rows[0].PNPS比).toBeCloseTo(0.6, 2);
  });
});

describe('buildFullWorkbook（多 sheet 导出）', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
  });

  it('只有 measurements 时只输出测量数据 sheet', async () => {
    const r = await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
    const i = await db.indicators.add({ name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L', defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1 });
    const m: Measurement = {
      scene: 'daily', date: '2026-08-30', phase: null, reactorId: r, indicatorId: i,
      inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10, value: 13.6,
      curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    };
    const { wb, counts } = await buildFullWorkbook([m]);
    expect(wb.SheetNames).toEqual(['测量数据']);
    expect(counts.total).toBe(1);
  });

  it('含其他指标时输出多 sheet（按数据存在动态添加）', async () => {
    const r = await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
    const i = await db.indicators.add({ name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L', defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1 });
    const m: Measurement = {
      scene: 'daily', date: '2026-08-30', phase: null, reactorId: r, indicatorId: i,
      inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10, value: 13.6,
      curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    };
    await db.mlssRecords.add({ date: '2026-08-30', reactorId: null, paperNo: 'A-1', m1: 0.7, m2: 0.8, m3: 25, m4: 25.01, v: 15, mlss: 6.667, mlvss: 50.667, note: '', createdAt: '' });
    const { wb, counts } = await buildFullWorkbook([m]);
    expect(wb.SheetNames).toEqual(['测量数据', '污泥浓度']);
    expect(counts.total).toBe(2);
  });

  it('includeExtras=false → 只输出测量数据 sheet', async () => {
    const r = await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
    const i = await db.indicators.add({ name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L', defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1 });
    const m: Measurement = {
      scene: 'daily', date: '2026-08-30', phase: null, reactorId: r, indicatorId: i,
      inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10, value: 13.6,
      curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    };
    await db.mlssRecords.add({ date: '2026-08-30', reactorId: null, paperNo: 'A-1', m1: 0.7, m2: 0.8, m3: 25, m4: 25.01, v: 15, mlss: 6.667, mlvss: 50.667, note: '', createdAt: '' });
    const { wb, counts } = await buildFullWorkbook([m], { includeExtras: false });
    expect(wb.SheetNames).toEqual(['测量数据']);
    expect(counts.total).toBe(1);
  });
});
