import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import {
  linearRegression,
  resolveCurve,
  computeConcentration,
  saveCurve,
  countMeasurementsByCurve,
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
