import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import type { Measurement } from '../db/schema';
import {
  trashMeasurements,
  listTrash,
  restoreTrash,
  purgeTrash,
  emptyTrash,
  purgeExpiredTrash,
} from './trash';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

function mkMeasurement(id: number, date = '2026-09-01'): Measurement {
  return {
    id,
    scene: 'daily',
    date,
    phase: null,
    reactorId: 1,
    indicatorId: 1,
    inputType: 'absorbance',
    sampleAbs: 0.2,
    blankAbs: 0.01,
    dilution: 1,
    value: 12.3,
    curveId: null,
    blankOverridden: false,
    dilutionOverridden: false,
    note: '',
  };
}

describe('trash（回收站）', () => {
  beforeEach(clearAll);

  it('删除的记录可完整恢复到原表（含原 id）', async () => {
    const m1 = mkMeasurement(1);
    const m2 = mkMeasurement(2, '2026-09-02');
    await db.measurements.bulkAdd([m1, m2]);
    expect(await db.measurements.count()).toBe(2);

    // 删除两条 → 进回收站
    await trashMeasurements([m1, m2]);
    await db.measurements.bulkDelete([1, 2]);
    expect(await db.measurements.count()).toBe(0);
    expect(await db.trashRecords.count()).toBe(1);

    // 列表显示
    const list = await listTrash();
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
    expect(list[0].table).toBe('measurements');

    // 恢复
    const restored = await restoreTrash(list[0].id);
    expect(restored).toBe(2);
    expect(await db.measurements.count()).toBe(2);
    const back = await db.measurements.get(1);
    expect(back?.value).toBe(12.3);
    expect(await db.trashRecords.count()).toBe(0);
  });

  it('多次删除产生多条回收站记录，可分别恢复/彻底删除', async () => {
    await trashMeasurements([mkMeasurement(1)]);
    await db.measurements.bulkDelete([1]);
    await trashMeasurements([mkMeasurement(2)]);
    await db.measurements.bulkDelete([2]);

    let list = await listTrash();
    expect(list).toHaveLength(2);

    // 彻底删除第一条
    await purgeTrash(list[0].id);
    list = await listTrash();
    expect(list).toHaveLength(1);
    expect(await db.measurements.count()).toBe(0);
  });

  it('过期清理：超过 30 天的记录被清除，未超期保留', async () => {
    const now = Date.now();
    const old = new Date(now - 40 * 86_400_000).toISOString();
    const fresh = new Date(now - 5 * 86_400_000).toISOString();
    await db.trashRecords.bulkAdd([
      { table: 'measurements', data: JSON.stringify([mkMeasurement(9)]), deletedAt: old },
      { table: 'measurements', data: JSON.stringify([mkMeasurement(10)]), deletedAt: fresh },
    ]);
    const cleared = await purgeExpiredTrash(30);
    expect(cleared).toBe(1);
    const rest = await listTrash();
    expect(rest).toHaveLength(1);
  });

  it('空回收站清空为无操作', async () => {
    await emptyTrash();
    expect(await listTrash()).toEqual([]);
  });
});
