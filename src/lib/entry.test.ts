import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import {
  saveMeasurement,
  getMeasurement,
  getDefault,
  upsertDefault,
  dailyScope,
  saveInfluent,
  getInfluents,
  deleteDailyData,
} from './entry';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

async function seedBase() {
  const nh4Id = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const codId = await db.indicators.add({
    name: 'COD', category: 'basic', method: 'direct', unit: 'mg/L',
    defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 5,
  });
  const reactorId = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  const reactor2Id = await db.reactors.add({
    code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '',
  });
  const curveId = await db.curves.add({
    indicatorId: nh4Id, effectiveFrom: '2026-08-01', effectiveTo: null,
    k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
  });
  return { nh4Id, codId, reactorId, reactor2Id, curveId };
}

describe('saveMeasurement', () => {
  let ids: Awaited<ReturnType<typeof seedBase>>;

  beforeEach(async () => {
    await clearAll();
    ids = await seedBase();
  });

  it('absorbance 指标：自动换算浓度并记录曲线 id', async () => {
    const id = await saveMeasurement({
      scene: 'daily', date: '2026-08-05', phase: null, reactorId: ids.reactorId, indicatorId: ids.nh4Id,
      sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
      blankOverridden: false, dilutionOverridden: false, note: '',
    });
    const m = await db.measurements.get(id);
    expect(m?.value).toBeCloseTo(((0.284 - 0.012 - 0.1) / 0.3) * 10, 6);
    expect(m?.curveId).toBe(ids.curveId);
    expect(m?.inputType).toBe('absorbance');
  });

  it('direct 指标：value 直接取输入值，curveId 为空', async () => {
    const id = await saveMeasurement({
      scene: 'daily', date: '2026-08-05', phase: null, reactorId: ids.reactorId, indicatorId: ids.codId,
      sampleAbs: 32, blankAbs: null, dilution: null,
      blankOverridden: false, dilutionOverridden: false, note: '',
    });
    const m = await db.measurements.get(id);
    expect(m?.value).toBe(32);
    expect(m?.curveId).toBeNull();
    expect(m?.inputType).toBe('direct');
  });

  it('无曲线：value 为 null（不填 0）', async () => {
    await db.curves.clear();
    const id = await saveMeasurement({
      scene: 'daily', date: '2026-08-05', phase: null, reactorId: ids.reactorId, indicatorId: ids.nh4Id,
      sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
      blankOverridden: false, dilutionOverridden: false, note: '',
    });
    const m = await db.measurements.get(id);
    expect(m?.value).toBeNull();
    expect(m?.curveId).toBeNull();
  });

  it('重复保存同一天同罐同指标：更新而非新增', async () => {
    const base = {
      scene: 'daily' as const, date: '2026-08-05', phase: null as const,
      reactorId: ids.reactorId, indicatorId: ids.nh4Id, blankAbs: 0.012, dilution: 10,
      blankOverridden: false, dilutionOverridden: false, note: '',
    };
    const id1 = await saveMeasurement({ ...base, sampleAbs: 0.284 });
    const id2 = await saveMeasurement({ ...base, sampleAbs: 0.5 });
    expect(id1).toBe(id2);
    expect(await db.measurements.count()).toBe(1);
    expect((await db.measurements.get(id2))?.sampleAbs).toBe(0.5);
  });

  it('getMeasurement 能回填读取', async () => {
    const id = await saveMeasurement({
      scene: 'daily', date: '2026-08-05', phase: null, reactorId: ids.reactorId, indicatorId: ids.nh4Id,
      sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
      blankOverridden: false, dilutionOverridden: false, note: '',
    });
    const m = await getMeasurement('daily', '2026-08-05', ids.reactorId, ids.nh4Id);
    expect(m?.id).toBe(id);
    expect(m?.sampleAbs).toBe(0.284);
  });
});

describe('defaults', () => {
  let ids: Awaited<ReturnType<typeof seedBase>>;

  beforeEach(async () => {
    await clearAll();
    ids = await seedBase();
  });

  it('upsertDefault 先建后改，不产生重复', async () => {
    const scope = dailyScope('2026-08-05');
    await upsertDefault(scope, ids.nh4Id, 0.012, 10);
    let d = await getDefault(scope, ids.nh4Id);
    expect(d?.blankAbs).toBe(0.012);
    expect(d?.dilution).toBe(10);

    await upsertDefault(scope, ids.nh4Id, 0.02, 20);
    d = await getDefault(scope, ids.nh4Id);
    expect(d?.blankAbs).toBe(0.02);
    expect(d?.dilution).toBe(20);
    expect(await db.defaults.count()).toBe(1);
  });
});

describe('saveInfluent', () => {
  let ids: Awaited<ReturnType<typeof seedBase>>;

  beforeEach(async () => {
    await clearAll();
    ids = await seedBase();
  });

  it('absorbance 指标：进水吸光度经标曲换算并记录曲线 id', async () => {
    await saveInfluent({
      date: '2026-08-05', mode: 'shared', reactorId: null, indicatorId: ids.nh4Id,
      sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
    });
    const list = await getInfluents('2026-08-05');
    expect(list).toHaveLength(1);
    expect(list[0].value).toBeCloseTo(((0.284 - 0.012 - 0.1) / 0.3) * 10, 6);
    expect(list[0].curveId).toBe(ids.curveId);
    expect(list[0].sampleAbs).toBe(0.284);
    expect(list[0].inputType).toBe('absorbance');
  });

  it('direct 指标：进水 value 直接取输入浓度', async () => {
    await saveInfluent({
      date: '2026-08-05', mode: 'shared', reactorId: null, indicatorId: ids.codId,
      sampleAbs: 40, blankAbs: null, dilution: null,
    });
    const list = await getInfluents('2026-08-05');
    expect(list).toHaveLength(1);
    expect(list[0].value).toBe(40);
    expect(list[0].curveId).toBeNull();
    expect(list[0].inputType).toBe('direct');
  });

  it('无标曲时换算值为 null，清除该格', async () => {
    await db.curves.clear();
    await saveInfluent({
      date: '2026-08-05', mode: 'shared', reactorId: null, indicatorId: ids.nh4Id,
      sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
    });
    expect(await getInfluents('2026-08-05')).toHaveLength(0);
  });

  it('覆盖更新，不产生重复', async () => {
    const base = {
      date: '2026-08-05', mode: 'shared' as const, reactorId: null, indicatorId: ids.nh4Id,
      blankAbs: 0.012, dilution: 10,
    };
    await saveInfluent({ ...base, sampleAbs: 0.284 });
    await saveInfluent({ ...base, sampleAbs: 0.5 });
    const list = await getInfluents('2026-08-05');
    expect(list).toHaveLength(1);
    expect(list[0].sampleAbs).toBe(0.5);
  });

  it('分罐模式按罐隔离', async () => {
    const base = {
      date: '2026-08-05', mode: 'perReactor' as const, indicatorId: ids.nh4Id,
      sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
    };
    await saveInfluent({ ...base, reactorId: ids.reactorId });
    await saveInfluent({ ...base, reactorId: ids.reactor2Id, sampleAbs: 0.5 });
    const list = await getInfluents('2026-08-05');
    expect(list).toHaveLength(2);
  });
});

describe('deleteDailyData', () => {
  let ids: Awaited<ReturnType<typeof seedBase>>;

  beforeEach(async () => {
    await clearAll();
    ids = await seedBase();
  });

  it('删除某天的测量、进水、默认值，不影响其他日期', async () => {
    // 当天数据
    await saveMeasurement({
      scene: 'daily', date: '2026-08-05', phase: null, reactorId: ids.reactorId, indicatorId: ids.nh4Id,
      sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
      blankOverridden: false, dilutionOverridden: false, note: '',
    });
    await saveInfluent({
      date: '2026-08-05', mode: 'shared', reactorId: null, indicatorId: ids.nh4Id,
      sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
    });
    await upsertDefault(dailyScope('2026-08-05'), ids.nh4Id, 0.012, 10);
    // 其他日期数据
    await saveMeasurement({
      scene: 'daily', date: '2026-08-06', phase: null, reactorId: ids.reactorId, indicatorId: ids.nh4Id,
      sampleAbs: 0.5, blankAbs: 0.012, dilution: 10,
      blankOverridden: false, dilutionOverridden: false, note: '',
    });

    await deleteDailyData('2026-08-05');

    expect(await db.measurements.where('date').equals('2026-08-05').count()).toBe(0);
    expect(await db.influents.where('date').equals('2026-08-05').count()).toBe(0);
    expect(await db.defaults.where('scopeKey').equals(dailyScope('2026-08-05')).count()).toBe(0);
    // 其他日期保留
    expect(await db.measurements.where('date').equals('2026-08-06').count()).toBe(1);
  });
});
