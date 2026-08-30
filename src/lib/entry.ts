import {
  db,
  type Measurement,
  type Scene,
  type Phase,
  type DailyDefault,
  type InfluentMode,
  type InputType,
} from '../db/schema';
import { resolveCurve, computeConcentration } from './calibration';

export function dailyScope(date: string): string {
  return `daily:${date}`;
}

export function cycleScope(cycleRunId: number): string {
  return `cycle:${cycleRunId}`;
}

/** 读取某指标某范围内的默认空白/稀释（用于录入回填） */
export async function getDefault(
  scopeKey: string,
  indicatorId: number,
): Promise<DailyDefault | null> {
  return (
    (await db.defaults.where('[scopeKey+indicatorId]').equals([scopeKey, indicatorId]).first()) ??
    null
  );
}

/** 写入/更新某指标的默认空白与稀释 */
export async function upsertDefault(
  scopeKey: string,
  indicatorId: number,
  blankAbs: number | null,
  dilution: number,
): Promise<void> {
  const existing = await getDefault(scopeKey, indicatorId);
  if (existing) {
    await db.defaults.update(existing.id!, { blankAbs, dilution });
  } else {
    await db.defaults.add({ scopeKey, indicatorId, blankAbs, dilution });
  }
}

export interface MeasurementInput {
  scene: Scene;
  date: string;
  cycleRunId?: number;
  time?: string;
  phase: Phase;
  reactorId: number;
  indicatorId: number;
  /** absorbance 指标为水样吸光度；direct 指标为直接填写的浓度 */
  sampleAbs: number | null;
  blankAbs: number | null;
  dilution: number | null;
  blankOverridden: boolean;
  dilutionOverridden: boolean;
  note: string;
}

/** 保存一条测量：自动换算浓度、冗余记录曲线 id，重复保存时更新而非新增 */
export async function saveMeasurement(input: MeasurementInput): Promise<number> {
  const indicator = await db.indicators.get(input.indicatorId);
  if (!indicator) throw new Error('指标不存在');

  let value: number | null = null;
  let curveId: number | null = null;
  const inputType = indicator.method;

  if (indicator.method === 'direct') {
    value = input.sampleAbs;
  } else {
    const curve = await resolveCurve(input.indicatorId, input.date);
    curveId = curve?.id ?? null;
    value = computeConcentration({
      sampleAbs: input.sampleAbs,
      blankAbs: input.blankAbs,
      dilution: input.dilution,
      curve,
      lod: indicator.lod,
    }).value;
  }

  const existing = await db.measurements
    .where('[reactorId+indicatorId+date]')
    .equals([input.reactorId, input.indicatorId, input.date])
    .filter(
      (m) =>
        m.scene === input.scene &&
        (input.scene === 'daily'
          ? true
          : m.cycleRunId === input.cycleRunId && m.time === input.time),
    )
    .first();

  const record: Measurement = {
    scene: input.scene,
    date: input.date,
    cycleRunId: input.cycleRunId,
    time: input.time,
    phase: input.phase,
    reactorId: input.reactorId,
    indicatorId: input.indicatorId,
    inputType,
    sampleAbs: input.sampleAbs,
    blankAbs: input.blankAbs,
    dilution: input.dilution,
    value,
    curveId,
    blankOverridden: input.blankOverridden,
    dilutionOverridden: input.dilutionOverridden,
    note: input.note,
  };

  if (existing?.id != null) {
    await db.measurements.update(existing.id, record);
    return existing.id;
  }
  return db.measurements.add(record);
}

/** 读取某天某罐某指标的测量记录（用于回填编辑） */
export async function getMeasurement(
  scene: Scene,
  date: string,
  reactorId: number,
  indicatorId: number,
  cycleRunId?: number,
  time?: string,
): Promise<Measurement | null> {
  return (
    (await db.measurements
      .where('[reactorId+indicatorId+date]')
      .equals([reactorId, indicatorId, date])
      .filter(
        (m) =>
          m.scene === scene &&
          (scene === 'daily' ? true : m.cycleRunId === cycleRunId && m.time === time),
      )
      .first()) ?? null
  );
}

/** 保存进水：absorbance 指标按吸光度经标曲换算，direct 指标直接填浓度；换算值为 null 时清除该格 */
export async function saveInfluent(input: {
  date: string;
  mode: InfluentMode;
  reactorId: number | null;
  indicatorId: number;
  /** absorbance 指标为水样吸光度；direct 指标为直接填写的浓度 */
  sampleAbs: number | null;
  blankAbs: number | null;
  dilution: number | null;
}): Promise<void> {
  const indicator = await db.indicators.get(input.indicatorId);
  if (!indicator) throw new Error('指标不存在');

  const inputType: InputType = indicator.method;
  let value: number | null = null;
  let curveId: number | null = null;

  if (indicator.method === 'direct') {
    value = input.sampleAbs;
  } else {
    const curve = await resolveCurve(input.indicatorId, input.date);
    curveId = curve?.id ?? null;
    value = computeConcentration({
      sampleAbs: input.sampleAbs,
      blankAbs: input.blankAbs,
      dilution: input.dilution,
      curve,
      lod: indicator.lod,
    }).value;
  }

  const existing = await db.influents
    .where('date')
    .equals(input.date)
    .filter((m) => m.indicatorId === input.indicatorId && m.reactorId === input.reactorId)
    .first();

  if (value == null) {
    if (existing) await db.influents.delete(existing.id!);
    return;
  }

  if (existing) {
    await db.influents.update(existing.id!, {
      mode: input.mode,
      sampleAbs: input.sampleAbs,
      blankAbs: input.blankAbs,
      dilution: input.dilution,
      value,
      curveId,
      inputType,
    });
  } else {
    await db.influents.add({
      date: input.date,
      cycleRunId: undefined,
      mode: input.mode,
      reactorId: input.reactorId,
      indicatorId: input.indicatorId,
      inputType,
      sampleAbs: input.sampleAbs,
      blankAbs: input.blankAbs,
      dilution: input.dilution,
      value,
      curveId,
    });
  }
}

/** 读取某天的全部进水记录 */
export async function getInfluents(date: string) {
  return db.influents.where('date').equals(date).toArray();
}

/** 删除某天的全部日常录入数据（测量、进水、默认空白/稀释），不影响其他日期 */
export async function deleteDailyData(date: string): Promise<void> {
  await db.measurements
    .where('date')
    .equals(date)
    .filter((m) => m.scene === 'daily')
    .delete();
  await db.influents.where('date').equals(date).delete();
  await db.defaults.where('scopeKey').equals(dailyScope(date)).delete();
}
