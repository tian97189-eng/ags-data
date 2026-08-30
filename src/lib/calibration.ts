import { db, type CalibrationCurve, type CalibrationPoint } from '../db/schema';

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

/** 核心换算：浓度 = (A样 − A空 − b) / k × 稀释倍数 */
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
  const blank = p.blankAbs ?? 0;
  const dilution = p.dilution ?? 1;
  const raw = (p.sampleAbs - blank - curve.b) / curve.k;
  const value = raw * dilution;

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
