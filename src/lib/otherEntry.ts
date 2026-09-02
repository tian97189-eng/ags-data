import { db, type OtherMeasurement } from '../db/schema';
import { computeConcentration } from './calibration';

/**
 * 「他人数据」独立空间 —— 帮别人测水质时用，完全不碰自己的反应器和测量数据。
 * 罐存在 otherReactors、数据存在 otherMeasurements，与自己的数据物理隔离。
 */

/** 查该指标在某日期生效的标曲 */
export async function resolveOtherCurve(indicatorId: number, date: string) {
  const candidates = await db.curves
    .where('indicatorId')
    .equals(indicatorId)
    .filter((c) => c.effectiveFrom <= date && (c.effectiveTo === null || c.effectiveTo >= date))
    .toArray();
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return candidates[0];
}

/** 保存某罐某指标的他人测量（吸光度换算或直读） */
export async function saveOtherMeasurement(input: {
  date: string;
  reactorId: number;
  indicatorId: number;
  inputType: 'absorbance' | 'direct';
  sampleAbs: number | null;
  blankAbs: number | null;
  dilution: number | null;
  value?: number | null;
  curveId?: number | null;
  lod?: number | null;
}): Promise<void> {
  const { date, reactorId, indicatorId, inputType } = input;
  // 直读：value 直接用；吸光度：用标曲换算
  let value: number | null = input.value ?? null;
  let curveId: number | null = input.curveId ?? null;
  if (inputType === 'absorbance' && input.sampleAbs != null) {
    const curve = curveId != null
      ? (await db.curves.get(curveId)) ?? null
      : await resolveOtherCurve(indicatorId, date);
    const r = computeConcentration({
      sampleAbs: input.sampleAbs,
      blankAbs: input.blankAbs,
      dilution: input.dilution,
      curve,
      lod: input.lod ?? null,
    });
    value = r.value;
    curveId = curve?.id ?? null;
  }

  // 清除该罐该指标当日的旧记录，再写入新值（保持与日常录入一致）
  const existing = await db.otherMeasurements
    .where('date')
    .equals(date)
    .filter((m) => m.reactorId === reactorId && m.indicatorId === indicatorId)
    .toArray();

  if (value == null) {
    // 空值 → 删掉旧记录
    for (const e of existing) await db.otherMeasurements.delete(e.id!);
    return;
  }

  const payload: Omit<OtherMeasurement, 'id'> = {
    date, reactorId, indicatorId, inputType,
    sampleAbs: input.sampleAbs,
    blankAbs: input.blankAbs,
    dilution: input.dilution,
    value, curveId,
    note: '', createdAt: new Date().toISOString(),
  };
  if (existing[0]?.id) {
    await db.otherMeasurements.update(existing[0].id, payload);
  } else {
    await db.otherMeasurements.add(payload);
  }
}

/** 删除某人某天的所有他人数据（可选仅某罐） */
export async function deleteOtherMeasurements(date: string, reactorId?: number): Promise<void> {
  const list = await db.otherMeasurements.where('date').equals(date).toArray();
  for (const m of list) {
    if (reactorId == null || m.reactorId === reactorId) {
      await db.otherMeasurements.delete(m.id!);
    }
  }
}

/** 他人罐的完整增删改查（含默认 R1/R2/R3 首次填充） */
export async function seedOtherReactorsIfEmpty(): Promise<void> {
  const count = await db.otherReactors.count();
  if (count > 0) return;
  const now = new Date().toISOString();
  for (const [i, code] of ['R1', 'R2', 'R3'].entries()) {
    await db.otherReactors.add({
      code, name: code, note: '', active: true, sortOrder: i + 1, createdAt: now,
    });
  }
}