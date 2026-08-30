import { timeToMinutes } from './format';

/** 生成周期采样时间点序列 */
export function generateTimes(
  startTime: string,
  intervalMinutes: number,
  count: number,
): string[] {
  const start = timeToMinutes(startTime);
  const times: string[] = [];
  for (let i = 0; i < count; i++) {
    times.push(minutesToTime(start + i * intervalMinutes));
  }
  return times;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface CycleStats {
  start: number | null;
  min: number | null;
  max: number | null;
  /** 从起点到首次 <= target 的分钟数 */
  timeToTarget: number | null;
}

/** 单个罐一个周期内的时序统计 */
export function cycleStats(
  times: string[],
  values: (number | null)[],
  target?: number | null,
): CycleStats {
  const points = values
    .map((v, i) => ({ t: timeToMinutes(times[i]), v }))
    .filter((x): x is { t: number; v: number } => x.v != null);

  if (points.length === 0) {
    return { start: null, min: null, max: null, timeToTarget: null };
  }

  const start = points[0].v;
  const min = Math.min(...points.map((x) => x.v));
  const max = Math.max(...points.map((x) => x.v));
  let timeToTarget: number | null = null;
  if (target != null) {
    const hit = points.find((x) => x.v <= target);
    if (hit) timeToTarget = hit.t - points[0].t;
  }
  return { start, min, max, timeToTarget };
}
