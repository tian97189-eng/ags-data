import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import {
  linearRegression,
  resolveCurve,
  computeConcentration,
  saveCurve,
  countMeasurementsByCurve,
  deleteCurve,
  computeCompositeValue,
  recomputeAndSaveComposites,
} from './calibration';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('linearRegression', () => {
  it('完美线性数据：y = 0.3x + 0.1', () => {
    const r = linearRegression([
      { concentration: 1, absorbance: 0.4 },
      { concentration: 2, absorbance: 0.7 },
      { concentration: 3, absorbance: 1.0 },
      { concentration: 4, absorbance: 1.3 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.k).toBeCloseTo(0.3, 10);
    expect(r!.b).toBeCloseTo(0.1, 10);
    expect(r!.r2).toBeCloseTo(1, 10);
  });

  it('带噪声数据：R² 在 0 到 1 之间', () => {
    const r = linearRegression([
      { concentration: 0, absorbance: 0.012 },
      { concentration: 0.5, absorbance: 0.203 },
      { concentration: 1.0, absorbance: 0.394 },
      { concentration: 1.5, absorbance: 0.578 },
      { concentration: 2.0, absorbance: 0.769 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.r2).toBeGreaterThan(0.99);
    expect(r!.r2).toBeLessThanOrEqual(1);
    expect(r!.k).toBeGreaterThan(0);
  });

  it('点数不足 2 个返回 null', () => {
    expect(linearRegression([{ concentration: 1, absorbance: 0.4 }])).toBeNull();
    expect(linearRegression([])).toBeNull();
  });

  it('所有 x 相同返回 null', () => {
    expect(
      linearRegression([
        { concentration: 2, absorbance: 0.4 },
        { concentration: 2, absorbance: 0.7 },
      ]),
    ).toBeNull();
  });

  it('忽略非有限数值的点', () => {
    const r = linearRegression([
      { concentration: 1, absorbance: 0.4 },
      { concentration: 2, absorbance: 0.7 },
      { concentration: 3, absorbance: Number.NaN },
    ]);
    expect(r).not.toBeNull();
    expect(r!.k).toBeCloseTo(0.3, 10);
  });
});

describe('computeConcentration', () => {
  const curve = {
    indicatorId: 1,
    effectiveFrom: '2026-08-01',
    effectiveTo: null,
    k: 0.3,
    b: 0.1,
    r2: 0.999,
    points: [],
    batchNo: '',
    note: '',
    createdAt: '',
  };

  it('正常换算：浓度 = (A样 − A空 − b)/k × 稀释倍数', () => {
    const r = computeConcentration({
      sampleAbs: 0.284,
      blankAbs: 0.012,
      dilution: 10,
      curve,
    });
    expect(r.status).toBe('ok');
    expect(r.value).toBeCloseTo((0.284 - 0.012 - 0.1) / 0.3 * 10, 6);
  });

  it('无标曲返回 noCurve，值为 null', () => {
    const r = computeConcentration({
      sampleAbs: 0.284,
      blankAbs: 0.012,
      dilution: 10,
      curve: null,
    });
    expect(r.status).toBe('noCurve');
    expect(r.value).toBeNull();
  });

  it('缺吸光度也返回 noCurve', () => {
    const r = computeConcentration({ sampleAbs: null, blankAbs: 0, dilution: 1, curve });
    expect(r.status).toBe('noCurve');
  });

  it('结果为负返回 negative 并保留负值', () => {
    const r = computeConcentration({
      sampleAbs: 0.05,
      blankAbs: 0.012,
      dilution: 1,
      curve,
    });
    expect(r.status).toBe('negative');
    expect(r.value!).toBeLessThan(0);
  });

  it('低于检出限返回 belowLOD', () => {
    const r = computeConcentration({
      sampleAbs: 0.284,
      blankAbs: 0.012,
      dilution: 1,
      curve,
      lod: 10,
    });
    expect(r.status).toBe('belowLOD');
    expect(r.value!).toBeGreaterThan(0);
  });

  it('空白和稀释缺省时按 0 和 1 处理', () => {
    const r = computeConcentration({
      sampleAbs: 0.4,
      blankAbs: null,
      dilution: null,
      curve,
    });
    expect(r.value).toBeCloseTo((0.4 - 0.1) / 0.3, 6);
  });

  it('手动公式曲线：按公式 (6.9627*(A-A0)-0.004)*D 计算', () => {
    const formulaCurve = {
      ...curve,
      formulaType: 'formula' as const,
      formula: '(6.9627*(A-A0)-0.004)*D',
    };
    const r = computeConcentration({
      sampleAbs: 0.284,
      blankAbs: 0.012,
      dilution: 10,
      curve: formulaCurve,
    });
    expect(r.status).toBe('ok');
    expect(r.value).toBeCloseTo((6.9627 * (0.284 - 0.012) - 0.004) * 10, 6);
  });

  it('手动公式曲线同样识别负值', () => {
    const formulaCurve = {
      ...curve,
      formulaType: 'formula' as const,
      formula: 'A-A0',
    };
    const r = computeConcentration({
      sampleAbs: 0.01,
      blankAbs: 0.02,
      dilution: 1,
      curve: formulaCurve,
    });
    expect(r.status).toBe('negative');
  });

  it('公式非法时返回 noCurve（值 null）', () => {
    const formulaCurve = {
      ...curve,
      formulaType: 'formula' as const,
      formula: 'A+',
    };
    const r = computeConcentration({
      sampleAbs: 0.284,
      blankAbs: 0.012,
      dilution: 1,
      curve: formulaCurve,
    });
    expect(r.status).toBe('noCurve');
    expect(r.value).toBeNull();
  });
});

describe('resolveCurve', () => {
  beforeEach(clearAll);

  async function addCurve(effectiveFrom: string, k: number) {
    return db.curves.add({
      indicatorId: 1,
      effectiveFrom,
      effectiveTo: null,
      k,
      b: 0.1,
      r2: 0.999,
      points: [],
      batchNo: '',
      note: '',
      createdAt: '',
    });
  }

  it('取生效日 <= 查询日期的最近一条', async () => {
    await addCurve('2026-08-01', 0.3);
    await addCurve('2026-08-11', 0.5);

    const c1 = await resolveCurve(1, '2026-08-05');
    const c2 = await resolveCurve(1, '2026-08-15');
    expect(c1?.k).toBe(0.3);
    expect(c2?.k).toBe(0.5);
  });

  it('查询日期早于所有曲线生效日返回 null', async () => {
    await addCurve('2026-08-01', 0.3);
    expect(await resolveCurve(1, '2026-07-01')).toBeNull();
  });

  it('按指标隔离', async () => {
    await db.curves.add({
      indicatorId: 2,
      effectiveFrom: '2026-08-01',
      effectiveTo: null,
      k: 0.9,
      b: 0,
      r2: 1,
      points: [],
      batchNo: '',
      note: '',
      createdAt: '',
    });
    expect(await resolveCurve(1, '2026-08-05')).toBeNull();
  });

  it('支持生效截止日：过期曲线不再命中', async () => {
    await db.curves.add({
      indicatorId: 1,
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-10',
      k: 0.3,
      b: 0.1,
      r2: 0.999,
      points: [],
      batchNo: '',
      note: '',
      createdAt: '',
    });
    expect(await resolveCurve(1, '2026-08-05')).not.toBeNull();
    expect(await resolveCurve(1, '2026-08-15')).toBeNull();
  });
});

describe('saveCurve', () => {
  beforeEach(clearAll);

  function curveData(effectiveFrom: string, k: number) {
    return {
      indicatorId: 1,
      effectiveFrom,
      k,
      b: 0.1,
      r2: 0.999,
      points: [],
      batchNo: '',
      note: '',
      createdAt: '',
    };
  }

  it('新建曲线自动关闭旧曲线（旧曲线 effectiveTo = 新日前一天）', async () => {
    await saveCurve(curveData('2026-08-01', 0.3));
    const r2 = await saveCurve(curveData('2026-08-11', 0.5));
    expect(r2.ok).toBe(true);

    const all = await db.curves.toArray();
    expect(all).toHaveLength(2);
    const old = all.find((c) => c.k === 0.3)!;
    const next = all.find((c) => c.k === 0.5)!;
    expect(old.effectiveTo).toBe('2026-08-10');
    expect(next.effectiveTo).toBeNull();
  });

  it('往回插（新生效日早于现有生效曲线）被拒绝', async () => {
    await saveCurve(curveData('2026-08-11', 0.5));
    const r = await saveCurve(curveData('2026-08-01', 0.3));
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(await db.curves.count()).toBe(1);
  });

  it('不同指标互不影响', async () => {
    await saveCurve(curveData('2026-08-01', 0.3));
    const r = await saveCurve({
      ...curveData('2026-08-01', 0.9),
      indicatorId: 2,
    });
    expect(r.ok).toBe(true);
    expect(await db.curves.count()).toBe(2);
  });

  it('countMeasurementsByCurve 统计该曲线下的数据条数', async () => {
    const r = await saveCurve(curveData('2026-08-01', 0.3));
    expect(r.ok).toBe(true);
    expect(await countMeasurementsByCurve(r.id!)).toBe(0);

    await db.measurements.add({
      scene: 'daily',
      date: '2026-08-05',
      phase: null,
      reactorId: 1,
      indicatorId: 1,
      inputType: 'absorbance',
      sampleAbs: 0.284,
      blankAbs: 0.012,
      dilution: 10,
      value: 13.6,
      curveId: r.id!,
      blankOverridden: false,
      dilutionOverridden: false,
      note: '',
    });
    expect(await countMeasurementsByCurve(r.id!)).toBe(1);
  });
});

describe('deleteCurve', () => {
  beforeEach(clearAll);

  it('删除曲线后 curves 表少一条', async () => {
    const r = await saveCurve({
      indicatorId: 1,
      effectiveFrom: '2026-08-01',
      k: 0.3,
      b: 0.1,
      r2: 0.999,
      points: [],
      batchNo: '',
      note: '',
      createdAt: '',
    });
    expect(r.ok).toBe(true);
    expect(await db.curves.count()).toBe(1);

    await deleteCurve(r.id!);
    expect(await db.curves.count()).toBe(0);
  });

  it('删除曲线不影响已存测量值的浓度（冗余存储）', async () => {
    const r = await saveCurve({
      indicatorId: 1,
      effectiveFrom: '2026-08-01',
      k: 0.3,
      b: 0.1,
      r2: 0.999,
      points: [],
      batchNo: '',
      note: '',
      createdAt: '',
    });
    const mId = await db.measurements.add({
      scene: 'daily', date: '2026-08-05', phase: null, reactorId: 1, indicatorId: 1,
      inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
      value: 5.7333, curveId: r.id!,
      blankOverridden: false, dilutionOverridden: false, note: '',
    });

    await deleteCurve(r.id!);

    const m = await db.measurements.get(mId);
    expect(m).toBeTruthy();
    expect(m?.value).toBeCloseTo(5.7333, 4);
    expect(m?.curveId).toBe(r.id); // curveId 保留，指向已删除的曲线
  });
});

describe('computeCompositeValue', () => {
  function refMeasurements(date: string, reactorId: number, items: Array<{ indicatorId: number; value: number | null }>) {
    return items.map((it, i) => ({
      id: i + 1,
      scene: 'daily' as const,
      date,
      phase: null,
      reactorId,
      indicatorId: it.indicatorId,
      inputType: 'absorbance' as const,
      sampleAbs: null,
      blankAbs: null,
      dilution: null,
      value: it.value,
      curveId: null,
      blankOverridden: false,
      dilutionOverridden: false,
      note: '',
    }));
  }

  it('sumOf：把 compositeRefs 里指标的 value 加起来', () => {
    const indicator = { compositeType: 'sumOf' as const, compositeRefs: [10, 20, 30] } as any;
    const refs = refMeasurements('2026-08-30', 1, [
      { indicatorId: 10, value: 1.5 },
      { indicatorId: 20, value: 0.5 },
      { indicatorId: 30, value: 3.0 },
    ]);
    expect(computeCompositeValue({ indicator, refMeasurements: refs })).toBe(5.0);
  });

  it('sumOf：忽略无 value 的依赖指标（视为空）', () => {
    const indicator = { compositeType: 'sumOf' as const, compositeRefs: [10, 20] } as any;
    const refs = refMeasurements('2026-08-30', 1, [
      { indicatorId: 10, value: 1.5 },
      { indicatorId: 20, value: null },
    ]);
    expect(computeCompositeValue({ indicator, refMeasurements: refs })).toBe(1.5);
  });

  it('所有依赖指标都没值 → 返回 null（区别于 0）', () => {
    const indicator = { compositeType: 'sumOf' as const, compositeRefs: [10, 20] } as any;
    const refs = refMeasurements('2026-08-30', 1, [
      { indicatorId: 10, value: null },
      { indicatorId: 20, value: null },
    ]);
    expect(computeCompositeValue({ indicator, refMeasurements: refs })).toBeNull();
  });

  it('非 sumOf 复合类型 → 返回 null', () => {
    const indicator = { compositeType: null, compositeRefs: [] } as any;
    expect(computeCompositeValue({ indicator, refMeasurements: [] })).toBeNull();
  });
});

describe('recomputeAndSaveComposites', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
  });

  async function seedBasic() {
    const nh4 = await db.indicators.add({
      name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
    });
    const no2 = await db.indicators.add({
      name: '亚硝态氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 5, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 2,
    });
    const no3 = await db.indicators.add({
      name: '硝态氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 5, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 3,
    });
    const total = await db.indicators.add({
      name: '总氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 4,
      compositeType: 'sumOf', compositeRefs: [nh4, no2, no3],
    });
    const r1 = await db.reactors.add({
      code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
    });
    return { nh4, no2, no3, total, r1 };
  }

  it('依赖指标全有值 → 写一条 composite measurement（value=三者之和）', async () => {
    const { nh4, no2, no3, total, r1 } = await seedBasic();
    const date = '2026-08-30';
    await db.measurements.bulkAdd([
      { scene: 'daily', date, phase: null, reactorId: r1, indicatorId: nh4,
        inputType: 'absorbance', sampleAbs: 0.3, blankAbs: 0, dilution: 10, value: 1.5,
        curveId: null, blankOverridden: false, dilutionOverridden: false, note: '' },
      { scene: 'daily', date, phase: null, reactorId: r1, indicatorId: no2,
        inputType: 'absorbance', sampleAbs: 0.1, blankAbs: 0, dilution: 5, value: 0.5,
        curveId: null, blankOverridden: false, dilutionOverridden: false, note: '' },
      { scene: 'daily', date, phase: null, reactorId: r1, indicatorId: no3,
        inputType: 'absorbance', sampleAbs: 0.4, blankAbs: 0, dilution: 5, value: 3.0,
        curveId: null, blankOverridden: false, dilutionOverridden: false, note: '' },
    ]);

    await recomputeAndSaveComposites(date);

    const list = await db.measurements.where('date').equals(date).toArray();
    const tot = list.find((m) => m.indicatorId === total);
    expect(tot).toBeDefined();
    expect(tot?.reactorId).toBe(r1);
    expect(tot?.value).toBeCloseTo(5.0, 6);
    expect(tot?.note).toContain('自动计算');
  });

  it('已有 composite measurement → 更新 value（不重复插入）', async () => {
    const { nh4, no2, no3, total, r1 } = await seedBasic();
    const date = '2026-08-30';
    // 预先放一条 composite 记录（value=0）
    await db.measurements.add({
      scene: 'daily', date, phase: null, reactorId: r1, indicatorId: total,
      inputType: 'absorbance', sampleAbs: null, blankAbs: null, dilution: null, value: 0,
      curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    });
    await db.measurements.bulkAdd([
      { scene: 'daily', date, phase: null, reactorId: r1, indicatorId: nh4,
        inputType: 'absorbance', sampleAbs: 0, blankAbs: 0, dilution: 1, value: 2.0,
        curveId: null, blankOverridden: false, dilutionOverridden: false, note: '' },
      { scene: 'daily', date, phase: null, reactorId: r1, indicatorId: no3,
        inputType: 'absorbance', sampleAbs: 0, blankAbs: 0, dilution: 1, value: 3.0,
        curveId: null, blankOverridden: false, dilutionOverridden: false, note: '' },
    ]);

    await recomputeAndSaveComposites(date);

    const tot = (await db.measurements.where('date').equals(date).toArray()).find(
      (m) => m.indicatorId === total,
    );
    expect(tot?.value).toBeCloseTo(5.0, 6); // 2+3，跳过 no2（无 value）
  });

  it('依赖指标缺失 → 删掉已有的 composite 记录', async () => {
    const { total, r1 } = await seedBasic();
    const date = '2026-08-30';
    // 先插一条 composite
    await db.measurements.add({
      scene: 'daily', date, phase: null, reactorId: r1, indicatorId: total,
      inputType: 'absorbance', sampleAbs: null, blankAbs: null, dilution: null, value: 1,
      curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    });
    // 没插任何依赖指标 → 重算时删掉
    await recomputeAndSaveComposites(date);

    const tot = (await db.measurements.where('date').equals(date).toArray()).find(
      (m) => m.indicatorId === total,
    );
    expect(tot).toBeUndefined();
  });
});
