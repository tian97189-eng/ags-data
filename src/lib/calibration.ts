import { db, type CalibrationCurve, type CalibrationPoint, type Indicator, type Measurement } from '../db/schema';
import { evaluateFormula } from './formula';

// —— 最小二乘拟合 y = kx + b（x=浓度，y=吸光度）——
export interface FitResult {
  k: number;
  b: number;
  r2: number;
}

export function linearRegression(points: CalibrationPoint[]): FitResult | null {
  const valid = points.filter(
    (p) => Number.isFinite(p.concentration) && Number.isFinite(p.absorbance),
  );
  if (valid.length < 2) return null;

  const n = valid.length;
  const sx = valid.reduce((s, p) => s + p.concentration, 0);
  const sy = valid.reduce((s, p) => s + p.absorbance, 0);
  const sxx = valid.reduce((s, p) => s + p.concentration * p.concentration, 0);
  const sxy = valid.reduce((s, p) => s + p.concentration * p.absorbance, 0);

  const denom = n * sxx - sx * sx;
  if (denom === 0) return null; // 所有 x 相同，无法拟合

  const k = (n * sxy - sx * sy) / denom;
  const b = (sy - k * sx) / n;

  const yMean = sy / n;
  const ssTot = valid.reduce((s, p) => s + (p.absorbance - yMean) ** 2, 0);
  const ssRes = valid.reduce((s, p) => {
    const yPred = k * p.concentration + b;
    return s + (p.absorbance - yPred) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { k, b, r2 };
}

/** 按日期查找该指标生效的标曲：effectiveFrom <= date 且 (effectiveTo 为空或 >= date)，取生效最晚的一条 */
export async function resolveCurve(
  indicatorId: number,
  date: string,
): Promise<CalibrationCurve | null> {
  const candidates = await db.curves
    .where('indicatorId')
    .equals(indicatorId)
    .filter((c) => c.effectiveFrom <= date && (c.effectiveTo === null || c.effectiveTo >= date))
    .toArray();
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return candidates[0];
}

export type ComputeStatus = 'ok' | 'noCurve' | 'belowLOD' | 'negative';

/** 核心换算：拟合曲线为 浓度 = (A样 − A空 − b) / k × 稀释倍数；
 *  手动公式曲线为 浓度 = 公式(A=检测样, A0=空白, D=稀释) */
export function computeConcentration(p: {
  sampleAbs: number | null;
  blankAbs: number | null;
  dilution: number | null;
  curve: CalibrationCurve | null;
  lod?: number | null;
}): { value: number | null; status: ComputeStatus } {
  const { curve } = p;
  if (!curve || p.sampleAbs == null) {
    return { value: null, status: 'noCurve' };
  }

  let value: number;
  if (curve.formulaType === 'formula' && curve.formula) {
    const r = evaluateFormula(curve.formula, {
      A: p.sampleAbs,
      A0: p.blankAbs ?? 0,
      D: p.dilution ?? 1,
    });
    if (!r.ok || r.value == null) {
      return { value: null, status: 'noCurve' };
    }
    value = r.value;
  } else {
    const blank = p.blankAbs ?? 0;
    const dilution = p.dilution ?? 1;
    const raw = (p.sampleAbs - blank - curve.b) / curve.k;
    value = raw * dilution;
  }

  if (value < 0) return { value, status: 'negative' };
  if (p.lod != null && value < p.lod) return { value, status: 'belowLOD' };
  return { value, status: 'ok' };
}

// —— 标曲保存（新建只影响生效日之后，绝不改写历史）——
import { prevDay } from './format';

export interface SaveCurveResult {
  ok: boolean;
  id?: number;
  error?: string;
}

/**
 * 新建一条标曲：
 * - 自动把"当前生效"（effectiveTo 为 null）的同指标曲线关闭到新生效日的前一天
 * - 若新生效日早于现有生效曲线的生效日（往回插），拒绝并返回错误
 */
export async function saveCurve(
  data: Omit<CalibrationCurve, 'id' | 'effectiveTo'>,
): Promise<SaveCurveResult> {
  const current = await db.curves
    .where('indicatorId')
    .equals(data.indicatorId)
    .filter((c) => c.effectiveTo === null)
    .toArray();

  const conflict = current.find((c) => data.effectiveFrom < c.effectiveFrom);
  if (conflict) {
    return {
      ok: false,
      error: `新生效日 ${data.effectiveFrom} 早于现有生效曲线的生效日 ${conflict.effectiveFrom}，请选择不早于该日期的日期。`,
    };
  }

  const endDate = prevDay(data.effectiveFrom);
  for (const c of current) {
    await db.curves.update(c.id!, { effectiveTo: endDate });
  }

  const id = await db.curves.add({ ...data, effectiveTo: null });
  return { ok: true, id };
}

/** 统计某条曲线"算着多少条旧数据"，用于历史列表展示 */
export async function countMeasurementsByCurve(curveId: number): Promise<number> {
  return db.measurements.where('curveId').equals(curveId).count();
}

/** 删除一条标准曲线。已存测量值的浓度不受影响（冗余存储），仅失去曲线追溯。 */
export async function deleteCurve(curveId: number): Promise<void> {
  await db.curves.delete(curveId);
}

/** —— 复合公式指标（如总氮 = 氨氮 + 亚硝态氮 + 硝态氮） —— */

/** 纯函数：给定指标 + 同日同罐的依赖指标 measurements，算出复合指标的值 */
export function computeCompositeValue(input: {
  indicator: Indicator;
  refMeasurements: Measurement[];
}): number | null {
  const { indicator, refMeasurements } = input;
  if (indicator.compositeType !== 'sumOf' || !indicator.compositeRefs?.length) {
    return null;
  }
  let sum = 0;
  let hasAny = false;
  for (const refId of indicator.compositeRefs) {
    const m = refMeasurements.find((x) => x.indicatorId === refId);
    if (m?.value != null && Number.isFinite(m.value)) {
      sum += m.value;
      hasAny = true;
    }
  }
  return hasAny ? sum : null;
}

/** 保存基础指标后调用：重算并写入所有 compositeType 指标的 Measurement
 *  - 依赖指标全有值 → 写 measurement（inputType='absorbance' 但 value 由 composite 提供）
 *  - 依赖指标不全 → 删掉已有 composite measurement
 *  - 每个 (date, reactorId) 都处理
 */
export async function recomputeAndSaveComposites(date: string): Promise<void> {
  const composities = await db.indicators
    .filter((i) => i.active && i.compositeType === 'sumOf' && (i.compositeRefs?.length ?? 0) > 0)
    .toArray();
  if (!composities.length) return;

  // 同日 daily measurements（一次性查全，省得每指标单独查）
  const allDaily = await db.measurements
    .where('date')
    .equals(date)
    .filter((m) => m.scene === 'daily')
    .toArray();

  for (const composite of composities) {
    const refIds = composite.compositeRefs!;
    const compositeId = composite.id!;

    // 当前 composite 自己当日所有记录（按 reactorId 分组）
    const existingByReactor = new Map<number, Measurement>();
    for (const m of allDaily) {
      if (m.indicatorId === compositeId) {
        existingByReactor.set(m.reactorId, m);
      }
    }

    // 依赖指标当日所有记录（按 reactorId 分组）
    const refsByReactor = new Map<number, Measurement[]>();
    for (const m of allDaily) {
      if (refIds.includes(m.indicatorId)) {
        const list = refsByReactor.get(m.reactorId) ?? [];
        list.push(m);
        refsByReactor.set(m.reactorId, list);
      }
    }

    // 遍历所有相关罐（refs 存在 ∪ 已有 composite 记录），保证删残留/写新增都不漏
    const reactorIds = new Set<number>([
      ...refsByReactor.keys(),
      ...existingByReactor.keys(),
    ]);

    for (const reactorId of reactorIds) {
      const refs = refsByReactor.get(reactorId) ?? [];
      const value = computeCompositeValue({ indicator: composite, refMeasurements: refs });
      const existing = existingByReactor.get(reactorId);

      if (value == null) {
        // 依赖不全 → 删已有
        if (existing?.id) await db.measurements.delete(existing.id);
      } else if (existing?.id) {
        // 已有 → 更新 value（不动 sampleAbs/dilution/curveId）
        await db.measurements.update(existing.id, { value });
      } else {
        // 新增一条 composite 记录
        await db.measurements.add({
          scene: 'daily',
          date,
          phase: null,
          reactorId,
          indicatorId: compositeId,
          inputType: 'absorbance',
          sampleAbs: null,
          blankAbs: null,
          dilution: null,
          value,
          curveId: null,
          blankOverridden: false,
          dilutionOverridden: false,
          note: '由其他指标自动计算',
        });
      }
    }
  }
}
