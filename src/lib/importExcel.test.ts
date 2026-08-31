import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { parseImportFile, buildImportTemplate } from './importExcel';
import * as XLSX from 'xlsx';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('parseImportFile', () => {
  beforeEach(clearAll);

  async function seedRefs() {
    await db.reactors.bulkAdd([
      { code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' },
      { code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '' },
    ]);
    await db.indicators.bulkAdd([
      { name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L', defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1 },
      { name: 'COD', category: 'basic', method: 'direct', unit: 'mg/L', defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 5 },
    ]);
  }

  it('识别 4 列模板：日期/罐/指标/浓度', async () => {
    await seedRefs();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['日期', '罐', '指标', '浓度(mg/L)'],
      ['2026-09-01', 'R1', '氨氮', 13.6],
      ['2026-09-01', 'R2', 'COD', 35],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '数据');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const preview = await parseImportFile(new Uint8Array(buf));
    expect(preview.totalRows).toBe(2);
    expect(preview.okCount).toBe(2);
    expect(preview.rows[0]).toMatchObject({
      date: '2026-09-01',
      reactorCode: 'R1',
      indicatorName: '氨氮',
      value: 13.6,
      status: 'ok',
    });
    expect(preview.rows[1].indicatorName).toBe('COD');
  });

  it('未知的罐编号 → status: unknown_reactor', async () => {
    await seedRefs();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['日期', '罐', '指标', '浓度'],
      ['2026-09-01', 'R99', '氨氮', 13.6],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '数据');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const preview = await parseImportFile(new Uint8Array(buf));
    expect(preview.rows[0].status).toBe('unknown_reactor');
    expect(preview.rows[0].statusDetail).toContain('R99');
    expect(preview.unknownReactorCodes).toContain('R99');
  });

  it('未知的指标名 → status: unknown_indicator', async () => {
    await seedRefs();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['日期', '罐', '指标', '浓度'],
      ['2026-09-01', 'R1', '未知指标', 5],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '数据');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const preview = await parseImportFile(new Uint8Array(buf));
    expect(preview.rows[0].status).toBe('unknown_indicator');
    expect(preview.unknownIndicatorNames).toContain('未知指标');
  });

  it('非法日期格式 → status: invalid_date', async () => {
    await seedRefs();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['日期', '罐', '指标', '浓度'],
      ['不是日期', 'R1', '氨氮', 5],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '数据');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const preview = await parseImportFile(new Uint8Array(buf));
    expect(preview.rows[0].status).toBe('invalid_date');
  });

  it('空文件 → totalRows=0', async () => {
    await seedRefs();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['日期', '罐', '指标', '浓度']]);
    XLSX.utils.book_append_sheet(wb, ws, '数据');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const preview = await parseImportFile(new Uint8Array(buf));
    expect(preview.totalRows).toBe(0);
    expect(preview.okCount).toBe(0);
  });
});

describe('buildImportTemplate', () => {
  it('生成含示例数据的模板 sheet', () => {
    const wb = buildImportTemplate();
    expect(wb.SheetNames).toEqual(['使用说明', '数据', '示例场景']);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['数据']);
    expect(rows.length).toBeGreaterThan(0);
    expect((rows[0] as any)).toHaveProperty('日期');
    expect((rows[0] as any).罐).toBe('R1');
  });
});