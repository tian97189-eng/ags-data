import type { Measurement, Reactor } from '../db/schema';

export interface TrendSeries {
  name: string;
  data: [string, number | null][];
  mean: number | null;
}

function meanOf(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

/** 日常趋势：按罐分线，x=日期 */
export function buildDailyTrend(
  measurements: Measurement[],
  reactors: Reactor[],
): TrendSeries[] {
  return reactors.map((r) => {
    const pts = measurements
      .filter((m) => m.reactorId === r.id && m.scene === 'daily')
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return {
      name: r.code,
      data: pts.map((m) => [m.date, m.value] as [string, number | null]),
      mean: meanOf(pts.map((m) => m.value)),
    };
  });
}

/** 周期曲线：按罐分线，x=时间 */
export function buildCycleSeries(
  measurements: Measurement[],
  reactors: Reactor[],
  cycleRunId: number,
): TrendSeries[] {
  return reactors.map((r) => {
    const pts = measurements
      .filter((m) => m.reactorId === r.id && m.scene === 'cycle' && m.cycleRunId === cycleRunId)
      .sort((a, b) => ((a.time ?? '') < (b.time ?? '') ? -1 : 1));
    return {
      name: r.code,
      data: pts.map((m) => [m.time ?? '', m.value] as [string, number | null]),
      mean: meanOf(pts.map((m) => m.value)),
    };
  });
}

/** 同一罐同一指标，不同周期叠加（周期叠周期） */
export function buildCycleOverlay(
  measurements: Measurement[],
  cycles: { id: number; name: string }[],
  reactorId: number,
): TrendSeries[] {
  return cycles.map((c) => {
    const pts = measurements
      .filter((m) => m.scene === 'cycle' && m.cycleRunId === c.id && m.reactorId === reactorId)
      .sort((a, b) => ((a.time ?? '') < (b.time ?? '') ? -1 : 1));
    return {
      name: c.name,
      data: pts.map((m) => [m.time ?? '', m.value] as [string, number | null]),
      mean: meanOf(pts.map((m) => m.value)),
    };
  });
}
