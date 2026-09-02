import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import { trashRows, listTrash, restoreTrash } from './trash';
import { deleteDailyDataToTrash } from './entry';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('清空当日 → 回收站', () => {
  beforeEach(clearAll);

  async function seedDay(date: string) {
    await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
    const indId = await db.indicators.add({
      name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
    });
    const rId = 1;
    const m = await db.measurements.add({
      scene: 'daily', date, phase: null, reactorId: rId, indicatorId: indId,
      inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
      value: 5.7, curveId: null, blankOverridden: false, dilutionOverridden: false,
      note: '', createdAt: '',
    });
    const inf = await db.influents.add({
      date, mode: 'shared', reactorId: null, indicatorId: indId,
      inputType: 'absorbance', sampleAbs: 0.2, blankAbs: 0.012, dilution: 10,
      value: 3, curveId: null,
    });
    const def = await db.defaults.add({
      scopeKey: `daily:${date}`, indicatorId: indId, blankAbs: 0.012, dilution: 10, blankOverridden: false, dilutionOverridden: false,
    });
    return { m, inf, def, indId };
  }

  it('清空当日后数据进回收站且原表清空', async () => {
    await seedDay('2026-09-02');
    expect(await db.measurements.count()).toBe(1);
    expect(await db.influents.count()).toBe(1);
    expect(await db.defaults.count()).toBe(1);

    const res = await deleteDailyDataToTrash('2026-09-02');
    expect(res).toEqual({ measurements: 1, influents: 1, defaults: 1 });

    // 原表清空
    expect(await db.measurements.count()).toBe(0);
    expect(await db.influents.count()).toBe(0);
    expect(await db.defaults.count()).toBe(0);
    // 回收站 3 条
    const trash = await listTrash();
    expect(trash).toHaveLength(3);
    const tables = trash.map((t) => t.table).sort();
    expect(tables).toEqual(['defaults', 'influents', 'measurements']);
  });

  it('回收站条目可恢复到原表（保原 id）', async () => {
    const { m, inf, def } = await seedDay('2026-09-02');
    await deleteDailyDataToTrash('2026-09-02');
    expect(await db.measurements.count()).toBe(0);

    const trash = await listTrash();
    for (const t of trash) {
      const n = await restoreTrash(t.id);
      expect(n).toBe(1);
    }
    // 三类数据都回来了，且 id 与原记录一致
    expect(await db.measurements.count()).toBe(1);
    expect(await db.influents.count()).toBe(1);
    expect(await db.defaults.count()).toBe(1);
    expect((await db.measurements.get(m))?.sampleAbs).toBe(0.284);
    expect((await db.influents.get(inf))?.value).toBe(3);
    expect((await db.defaults.get(def))?.dilution).toBe(10);
    // 回收站清空
    expect(await db.trashRecords.count()).toBe(0);
  });

  it('当天无数据时清空不产生回收站条目', async () => {
    const res = await deleteDailyDataToTrash('2026-09-01');
    expect(res).toEqual({ measurements: 0, influents: 0, defaults: 0 });
    expect(await db.trashRecords.count()).toBe(0);
  });
});
