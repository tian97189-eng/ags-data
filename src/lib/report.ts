/**
 * Word 实验报告生成 —— 数据收集与统计（纯逻辑，不依赖 DOM，可单测）。
 *
 * 流程（由 UI 层串联）：
 *   collectReportData(params)          → 从 IndexedDB 收集日常数据并统计
 *   renderTrendCharts(data)            → ECharts 渲染趋势图（PNG，依赖浏览器）
 *   buildDocx(data, charts)            → 用 docx 库组装 Word 文档，输出 base64
 *
 * 统计口径（与 PRD 第 5 节一致）：
 *   - 只统计「日常数据」（scene = daily）；全周期密集采样不混入
 *   - 平均值/标准差/最值基于非空值，空值不计入
 *   - 去除率 = (进水 − 出水) / 进水 × 100；进水缺失的那天不算（不按 0 计）
 *   - 亚硝积累率 NAR = NO₂⁻/(NO₂⁻+NO₃⁻)×100；分母为 0 不算
 */
import { db } from '../db/schema';

export interface ReportParams {
  /** YYYY-MM-DD，闭区间 */
  dateFrom: string;
  dateTo: string;
  reactorIds: number[];
  indicatorIds: number[];
}

export interface ReactorStat {
  reactorCode: string;
  /** 非空数据条数 */
  count: number;
  mean: number | null;
  stdev: number | null;
  min: number | null;
  max: number | null;
  /** 平均去除率 %（该时间段内逐日去除率的均值；当天缺进水的不算） */
  removalRate: number | null;
}

export interface IndicatorSection {
  indicatorId: number;
  indicatorName: string;
  unit: string;
  method: 'absorbance' | 'direct';
  /** 是否复合指标（如总氮 = 三氮之和） */
  composite: boolean;
  stats: ReactorStat[];
}

export interface NARRow {
  reactorCode: string;
  /** 平均亚硝积累率 % */
  nar: number | null;
}

export interface ReportData {
  title: string;
  generatedAt: string;
  /** YYYY-MM-DD，报告里显示用 */
  generatedDate: string;
  dateFrom: string;
  dateTo: string;
  reactorCodes: string[];
  indicatorNames: string[];
  sections: IndicatorSection[];
  narRows: NARRow[];
  /** 参与统计的日常数据条数 */
  dailyCount: number;
}

/** 圆整到指定小数位，避免浮点尾巴；null 保持 null */
function round(v: number | null, digits = 1): number | null {
  if (v == null) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function meanOf(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function stdevOf(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = meanOf(xs)!;
  const ss = xs.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - 1));
}

/**
 * 收集统计：日常数据 → 每「指标 × 罐」的描述统计 + 平均去除率；以及 NAR。
 */
export async function collectReportData(params: ReportParams): Promise<ReportData> {
  const { dateFrom, dateTo, reactorIds, indicatorIds } = params;

  const reactors = (await db.reactors.toArray())
    .filter((r) => reactorIds.includes(r.id!))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const indicators = (await db.indicators.toArray())
    .filter((i) => indicatorIds.includes(i.id!))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const rIdSet = new Set(reactorIds);
  const iIdSet = new Set(indicatorIds);

  // 日常测量（只取 value 非空的）
  const measurements = (await db.measurements.toArray()).filter(
    (m) =>
      m.scene === 'daily' &&
      m.value != null &&
      m.date >= dateFrom &&
      m.date <= dateTo &&
      rIdSet.has(m.reactorId) &&
      iIdSet.has(m.indicatorId),
  );

  // 进水：按 date + indicatorId 分组
  // shared 模式记录 reactorId 为 null（所有罐共用）；perReactor 记录 reactorId = 罐 id
  const influents = (await db.influents.toArray()).filter(
    (f) => f.date >= dateFrom && f.date <= dateTo && iIdSet.has(f.indicatorId),
  );
  const influentByKey = new Map<string, number>();
  for (const f of influents) {
    // shared：key = `${date}|${indicatorId}|shared`；perReactor：key = `${date}|${indicatorId}|r${reactorId}`
    const key = f.mode === 'shared' ? `${f.date}|${f.indicatorId}|shared` : `${f.date}|${f.indicatorId}|r${f.reactorId}`;
    if (!influentByKey.has(key)) influentByKey.set(key, f.value);
  }

  const sections: IndicatorSection[] = [];
  for (const ind of indicators) {
    const stats: ReactorStat[] = [];
    for (const r of reactors) {
      const rows = measurements.filter((m) => m.indicatorId === ind.id! && m.reactorId === r.id!);
      const values = rows.map((m) => m.value!);

      // 平均去除率：逐日算，当天缺进水则跳过
      const dailyRates: number[] = [];
      for (const row of rows) {
        const inKey =
          r.id != null
            ? `${row.date}|${ind.id}|r${r.id}`
            : '';
        const sharedKey = `${row.date}|${ind.id}|shared`;
        const influentVal = influentByKey.get(inKey) ?? influentByKey.get(sharedKey);
        if (influentVal == null) continue;
        if (influentVal === 0) continue; // 进水为 0 无法算去除率，跳过
        const rate = ((influentVal - row.value!) / influentVal) * 100;
        if (Number.isFinite(rate)) dailyRates.push(rate);
      }

      stats.push({
        reactorCode: r.code,
        count: values.length,
        mean: round(meanOf(values)),
        stdev: round(stdevOf(values)),
        min: values.length ? round(Math.min(...values)) : null,
        max: values.length ? round(Math.max(...values)) : null,
        removalRate: round(meanOf(dailyRates)),
      });
    }
    sections.push({
      indicatorId: ind.id!,
      indicatorName: ind.name,
      unit: ind.unit || 'mg/L',
      method: ind.method,
      composite: ind.compositeType === 'sumOf',
      stats,
    });
  }

  // NAR：选中了亚硝态氮 + 硝态氮才显示
  const no2 = indicators.find((i) => i.name === '亚硝态氮');
  const no3 = indicators.find((i) => i.name === '硝态氮');
  const narRows: NARRow[] = [];
  if (no2 && no3) {
    for (const r of reactors) {
      const no2ByDate = new Map(
        measurements
          .filter((m) => m.indicatorId === no2.id! && m.reactorId === r.id!)
          .map((m) => [m.date, m.value!]),
      );
      const no3ByDate = new Map(
        measurements
          .filter((m) => m.indicatorId === no3.id! && m.reactorId === r.id!)
          .map((m) => [m.date, m.value!]),
      );
      const rates: number[] = [];
      for (const [date, v2] of no2ByDate) {
        const v3 = no3ByDate.get(date);
        if (v3 == null) continue;
        const denom = v2 + v3;
        if (denom === 0) continue;
        rates.push((v2 / denom) * 100);
      }
      narRows.push({ reactorCode: r.code, nar: round(meanOf(rates)) });
    }
  }

  const generatedAt = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    title: 'AGS 数据实验报告',
    generatedAt: generatedAt.toISOString(),
    dateFrom,
    dateTo,
    reactorCodes: reactors.map((r) => r.code),
    indicatorNames: indicators.map((i) => i.name),
    sections,
    narRows,
    dailyCount: measurements.length,
    generatedDate: fmt(generatedAt),
  };
}

/** 趋势图图片（PNG 二进制 + 插入 Word 时的显示尺寸，像素） */
export interface ChartImage {
  data: Uint8Array;
  /** 插入 Word 的显示宽度 */
  width: number;
  /** 插入 Word 的显示高度 */
  height: number;
}

/** dataURL（PNG base64）→ Uint8Array，供 docx ImageRun 使用 */
export function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
