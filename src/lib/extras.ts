/**
 * 其他指标工作表计算函数（MLSS / 筛分粒径 / EPS / 沉降性）
 * 全部纯函数，不依赖 React/Dexie，方便单测。
 */
import type { ReminderTime } from './reminder';

/** 算 MLSS / MLVSS（g/L）。输入重量单位 g，V 单位 mL → 需 ×1000 转 L。 */
export function computeMLSS(input: {
  m1: number | null;
  m2: number | null;
  m3: number | null;
  m4: number | null;
  v: number | null;
}): { mlss: number | null; mlvss: number | null } {
  const { m1, m2, m3, m4, v } = input;
  if (
    m1 == null || m2 == null || m3 == null || m4 == null || v == null ||
    !Number.isFinite(m1) || !Number.isFinite(m2) || !Number.isFinite(m3) ||
    !Number.isFinite(m4) || !Number.isFinite(v) || v === 0
  ) {
    return { mlss: null, mlvss: null };
  }
  const mlss = ((m2 - m1) / v) * 1000;
  const mlvss = ((m2 + m3 - m4) / v) * 1000;
  return {
    mlss: Number.isFinite(mlss) ? mlss : null,
    mlvss: Number.isFinite(mlvss) ? mlvss : null,
  };
}

/** 单行粒径记录的泥重 = M2 - M1 */
export function computeParticleDryWeight(paperWeight: number | null, sampleWeight: number | null): number | null {
  if (paperWeight == null || sampleWeight == null) return null;
  if (!Number.isFinite(paperWeight) || !Number.isFinite(sampleWeight)) return null;
  const w = sampleWeight - paperWeight;
  return w > 0 ? w : null;
}

/** 一组粒径记录（同一日期）→ 计算每行占比% + 中位径贡献；以及累计 d50
 *  - percent[row] = dryWeight[row] / Σ dryWeight * 100
 *  - contribution[row] = percent[row]% × mid[row]
 *  - d50 = 加权累计到 50% 时的中位径（线性插值），无单位
 */
export interface ParticleRow {
  rangeId: number | null;
  paperWeight: number | null;
  sampleWeight: number | null;
  /** 该粒径范围的中位径值 */
  mid: number;
}

export interface ParticleDistributionResult {
  /** 每行泥重 = samplePaper - paper */
  dryWeights: (number | null)[];
  /** 每行占比% */
  percents: (number | null)[];
  /** 每行中位径贡献 = percent × mid */
  contributions: (number | null)[];
  /** d50（μ m，线性插值），无足够数据返回 null */
  d50: number | null;
}

export function computeParticleDistribution(rows: ParticleRow[]): ParticleDistributionResult {
  const dryWeights = rows.map((r) => computeParticleDryWeight(r.paperWeight, r.sampleWeight));
  const total = dryWeights.reduce<number>((s, w) => s + (w ?? 0), 0);
  const percents = dryWeights.map((w) => (total > 0 && w != null ? (w / total) * 100 : null));
  const contributions = rows.map((r, i) => {
    const p = percents[i];
    return p != null ? (p * r.mid) / 100 : null;
  });

  // d50：从最大粒径到最小粒径（按 mid 降序）累计贡献，找 50% 处
  const indexed = rows.map((r, i) => ({ mid: r.mid, contrib: contributions[i] ?? 0 }));
  // 假设 mid 已按从小到大排列（实际录入时按 sortOrder = 粒径升序）；为保险排序
  indexed.sort((a, b) => a.mid - b.mid);
  let cum = 0;
  let d50: number | null = null;
  let prevMid = 0;
  let prevCum = 0;
  for (const r of indexed) {
    const newCum = cum + r.contrib;
    if (newCum >= 50 && cum < 50) {
      // 在 [prevMid, r.mid] 之间线性插值找 50% 处
      if (newCum === cum) {
        d50 = r.mid;
      } else {
        const need = 50 - cum;
        const seg = newCum - cum;
        d50 = prevMid + (r.mid - prevMid) * (need / seg);
      }
      break;
    }
    cum = newCum;
    prevMid = r.mid;
    prevCum = cum;
  }
  if (d50 == null && total > 0) {
    // 全部累加都没到 50%：用最大 mid（极小样品）
    d50 = indexed[indexed.length - 1]?.mid ?? null;
  }

  return { dryWeights, percents, contributions, d50 };
}

/** 算 EPS PS / PN 含量（mg/g VSS）和 PN/PS 比 */
export function computeEPS(input: {
  psConc: number | null;
  pnConc: number | null;
  extractVolume: number | null;
  vssMg: number | null;
}): { psContent: number | null; pnContent: number | null; pnPsRatio: number | null } {
  const { psConc, pnConc, extractVolume, vssMg } = input;
  if (
    psConc == null || pnConc == null || extractVolume == null || vssMg == null ||
    !Number.isFinite(psConc) || !Number.isFinite(pnConc) ||
    !Number.isFinite(extractVolume) || !Number.isFinite(vssMg) || vssMg === 0
  ) {
    return { psContent: null, pnContent: null, pnPsRatio: null };
  }
  // 浓度 mg/L × 体积 mL / 1000 → mg；除以 VSS mg → mg/mg → ×1000 转 mg/g VSS
  const psContent = (psConc * extractVolume) / vssMg;
  const pnContent = (pnConc * extractVolume) / vssMg;
  const pnPsRatio = psContent > 0 ? pnContent / psContent : null;
  return {
    psContent: Number.isFinite(psContent) ? psContent : null,
    pnContent: Number.isFinite(pnContent) ? pnContent : null,
    pnPsRatio,
  };
}

// —— EPS 之 PN 加药计时规划 ——
// PN 测定流程：加甲液 → 静置 settleAMin → 加乙液 → 静置 settleBMin → 测吸光度。
// 多样品需按顺序错开加药（每个样品间隔 intervalSec 秒，如 20 秒），
// 从第一个样品加甲液起计时，留 prepareMin 准备时间。

export interface PNScheduleStep {
  /** 第几个样品（1 起） */
  sampleNo: number;
  /** 加甲液：相对第一个样品加甲液开始时刻的秒数 */
  addAOffsetSec: number;
  /** 加乙液：= 加甲液 + 甲液静置 */
  addBOffsetSec: number;
  /** 测量：= 加乙液 + 乙液静置 */
  measureOffsetSec: number;
}

export interface PNSchedule {
  /** 准备时间（秒），即从开始准备到给第一个样品加甲液 */
  prepareSec: number;
  steps: PNScheduleStep[];
}

/**
 * 生成 PN 加药计时规划（纯函数）。
 * - sampleCount：样品总数
 * - intervalSec：相邻样品加甲液的时间间隔（秒）；样品少可调大
 * - settleAMin / settleBMin：甲液 / 乙液静置分钟
 * - prepareMin：准备时间（分钟）
 */
export function planPNSchedule(opts: {
  sampleCount: number;
  intervalSec: number;
  settleAMin: number;
  settleBMin: number;
  prepareMin: number;
}): PNSchedule {
  const { sampleCount, intervalSec, settleAMin, settleBMin, prepareMin } = opts;
  const prepareSec = Number.isFinite(prepareMin) && prepareMin > 0 ? Math.round(prepareMin * 60) : 0;
  if (!(sampleCount >= 1) || !(intervalSec > 0) || settleAMin < 0 || settleBMin < 0) {
    return { prepareSec, steps: [] };
  }
  const steps: PNScheduleStep[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const addA = i * intervalSec;
    const addB = addA + settleAMin * 60;
    const measure = addB + settleBMin * 60;
    steps.push({
      sampleNo: i + 1,
      addAOffsetSec: addA,
      addBOffsetSec: addB,
      measureOffsetSec: measure,
    });
  }
  return { prepareSec, steps };
}

/**
 * 把 PN 加药计时规划转成"响铃提醒时刻列表"（绝对时间 + 具体动作文案）。
 * - startAt：用户点「开始提醒」那一刻（毫秒）
 * - 准备阶段（prepareSec>0）也作为第一个提醒（"开始准备"）
 * - 每个样品 3 个动作：加甲液 / 加乙液 / 测吸光度
 * - 全部按时间升序排列，index 重新连续编号（供 SampleReminder 用）
 */
export function buildPNScheduleTimes(schedule: PNSchedule, startAt: Date): ReminderTime[] {
  const out: ReminderTime[] = [];
  let idx = 1;
  if (schedule.prepareSec > 0) {
    out.push({
      at: new Date(startAt.getTime()).toISOString(),
      index: idx++,
      text: '开始准备（加甲液前）',
    });
  }
  const base = startAt.getTime() + schedule.prepareSec * 1000;
  for (const s of schedule.steps) {
    out.push({
      at: new Date(base + s.addAOffsetSec * 1000).toISOString(),
      index: idx++,
      text: `#${s.sampleNo} 加甲液`,
    });
    out.push({
      at: new Date(base + s.addBOffsetSec * 1000).toISOString(),
      index: idx++,
      text: `#${s.sampleNo} 加乙液`,
    });
    out.push({
      at: new Date(base + s.measureOffsetSec * 1000).toISOString(),
      index: idx++,
      text: `#${s.sampleNo} 测吸光度`,
    });
  }
  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  out.forEach((r, i) => {
    r.index = i + 1;
  });
  return out;
}

/** 把秒数偏移格式化成 MM:SS（超过 1 小时则 H:MM:SS） */
export function formatScheduleOffset(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}