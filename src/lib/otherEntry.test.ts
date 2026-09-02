import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import {
  seedOtherReactorsIfEmpty,
  resolveOtherCurve,
  saveOtherMeasurement,
  deleteOtherMeasurements,
} from './otherEntry';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('otherEntry（他人数据独立空间）', () => {
  beforeEach(clearAll);

  it('首次调用填充默认他人罐 R1/R2/R3（独立表，不影响自己的 reactors）', async () => {
    // 先建一个自己的反应器
    await db.reactors.add({
      code: 'MINE', name: '我的', note: '', active: true, sortOrder: 1, createdAt: '',
    });
    await seedOtherReactorsIfEmpty();
    const other = await db.otherReactors.orderBy('sortOrder').toArray();
    expect(other.map((r) => r.code)).toEqual(['R1', 'R2', 'R3']);
    // 自己的 reactors 不受影响
    expect(await db.reactors.count()).toBe(1);
    expect((await db.reactors.toArray())[0].code).toBe('MINE');
  });

  it('重复调用不重复插入他人罐', async () => {
    await seedOtherReactorsIfEmpty();
    await seedOtherReactorsIfEmpty();
    expect(await db.otherReactors.count()).toBe(3);
  });

  it('吸光度经标曲换算浓度写入 otherMeasurements', async () => {
    await seedOtherReactorsIfEmpty();
    const ind = await db.indicators.add({
      name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
    });
    await db.curves.add({
      indicatorId: ind, effectiveFrom: '2026-08-01', effectiveTo: null,
      k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
    });
    const [r1] = await db.otherReactors.toArray();

    await saveOtherMeasurement({
      date: '2026-09-01', reactorId: r1.id!, indicatorId: ind,
      inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
    });
    const list = await db.otherMeasurements.toArray();
    expect(list).toHaveLength(1);
    // (0.284 - 0.012 - 0.1) / 0.3 * 10 = 5.733
    expect(list[0].value).toBeCloseTo(5.7333, 3);
    expect(list[0].curveId).not.toBeNull();
    // 自己的 measurements 完全不受影响
    expect(await db.measurements.count()).toBe(0);
  });

  it('清空某日某人数据，且不影响其他日期', async () => {
    await seedOtherReactorsIfEmpty();
    const [r1] = await db.otherReactors.toArray();
    const ind = await db.indicators.add({
      name: 'COD', category: 'basic', method: 'direct', unit: 'mg/L',
      defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
    });
    await saveOtherMeasurement({
      date: '2026-09-01', reactorId: r1.id!, indicatorId: ind,
      inputType: 'direct', value: 40,
    });
    await saveOtherMeasurement({
      date: '2026-09-02', reactorId: r1.id!, indicatorId: ind,
      inputType: 'direct', value: 42,
    });
    expect(await db.otherMeasurements.count()).toBe(2);
    await deleteOtherMeasurements('2026-09-01');
    const rest = await db.otherMeasurements.toArray();
    expect(rest).toHaveLength(1);
    expect(rest[0].date).toBe('2026-09-02');
  });

  it('resolveOtherCurve 返回生效标曲，无标曲返回 null', async () => {
    const ind = await db.indicators.add({
      name: 'X', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
    });
    await db.curves.add({
      indicatorId: ind, effectiveFrom: '2026-08-01', effectiveTo: null,
      k: 0.1, b: 0, r2: 1, points: [], batchNo: '', note: '', createdAt: '',
    });
    expect((await resolveOtherCurve(ind, '2026-09-01'))?.k).toBeCloseTo(0.1, 4);
    expect(await resolveOtherCurve(ind, '2026-07-01')).toBeNull(); // 生效日前
  });
});
