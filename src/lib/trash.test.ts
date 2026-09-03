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

describe('回收站分组与泛化恢复（全周期/其他指标/他人数据/实验记录/标准曲线）', () => {
  beforeEach(clearAll);

  it('groupForRows：按表与 scene 归类', async () => {
    const { groupForRows } = await import('./trash');
    expect(groupForRows('measurements', [{ scene: 'daily' }])).toBe('daily');
    expect(groupForRows('measurements', [{ scene: 'cycle' }])).toBe('cycle');
    expect(groupForRows('mlssRecords', [{ mlss: 1 }])).toBe('mlss');
    expect(groupForRows('epsRecords', [{}])).toBe('eps');
    expect(groupForRows('sviRecords', [{}])).toBe('svi');
    expect(groupForRows('particleSizeRecords', [{}])).toBe('particle');
    expect(groupForRows('otherMeasurements', [{}])).toBe('other');
    expect(groupForRows('experimentRecords', [{}])).toBe('experiment');
    expect(groupForRows('curves', [{}])).toBe('curve');
  });

  it('listTrash 返回分组标签（循环测量归入「全周期」）', async () => {
    const { trashRows, listTrash } = await import('./trash');
    await trashRows('measurements', [{ scene: 'cycle', date: '2026-08-05', id: 7 }]);
    const list = await listTrash();
    expect(list[0].group).toBe('cycle');
    expect(list[0].count).toBe(1);
  });

  it('恢复写回 round-trip：mlssRecords / otherMeasurements / curves 可整条恢复', async () => {
    const { trashRows, restoreTrash } = await import('./trash');
    // 各类别各造一条并删入回收站
    const mId = await db.mlssRecords.add({ date: '2026-09-01', reactorId: null, paperNo: 'A', m1: 1, m2: 2, m3: 3, m4: 4, v: 15, mlss: 0.1, mlvss: 0.2, note: '', createdAt: '' });
    const row = await db.mlssRecords.get(mId);
    await db.mlssRecords.delete(mId);
    await trashRows('mlssRecords', [row!]);
    const oId = await db.otherMeasurements.add({ date: '2026-09-01', reactorId: 1, indicatorId: 1, inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null, value: 5, curveId: null, note: '', createdAt: '' });
    const orow = await db.otherMeasurements.get(oId);
    await db.otherMeasurements.delete(oId);
    await trashRows('otherMeasurements', [orow!]);
    const cId = await db.curves.add({ indicatorId: 1, effectiveFrom: '2026-08-01', effectiveTo: null, k: 0.5, b: 0, r2: 0.99, points: [], batchNo: 'x', note: '', createdAt: '' });
    const crow = await db.curves.get(cId);
    await db.curves.delete(cId);
    await trashRows('curves', [crow!]);

    const list = await (await import('./trash')).listTrash();
    expect(list.length).toBe(3);
    for (const item of list) {
      const n = await restoreTrash(item.id);
      expect(n).toBe(1);
    }
    // 三表都被写回
    expect(await db.mlssRecords.get(mId)).toBeTruthy();
    expect(await db.otherMeasurements.get(oId)).toBeTruthy();
    expect(await db.curves.get(cId)).toBeTruthy();
    // 回收站已清
    expect((await (await import('./trash')).listTrash()).length).toBe(0);
  });
});
