import type { Measurement, Influent, Reactor, Indicator } from '../db/schema';
import { mean } from './stats';
import { removalRate } from './stats';

/**
 * 实验周报自动生成：返回一段可直接复制进 Word/论文 timeline 的文本。
 * 内容：期间数据规模 → 各罐各指标表现（进水/出水/去除率/达标率）→ 异常记录 → 当日备注。
 */

export interface WeeklyInput {
  start: string; // YYYY-MM-DD（含）
  end: string; // YYYY-MM-DD（含）
  measurements: Measurement[];
  influents: Influent[];
  reactors: Reactor[];
  indicators: Indicator[];
  /** date → 备注 */
  dayNotes: Map<string, string>;
}

function num(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function buildWeeklyReport(inp: WeeklyInput): string {
  const { start, end, measurements, influents, reactors, indicators, dayNotes } = inp;
  const inWin = (d: string) => d >= start && d <= end;
  const activeReactors = reactors.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const activeIndicators = indicators
    .filter((i) => i.active && i.category !== 'extras')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const dailyOut = measurements.filter((m) => m.scene === 'daily' && m.value != null && inWin(m.date));
  const infs = influents.filter((i) => inWin(i.date) && i.value != null);

  const L: string[] = [];
  L.push(`实验周报（${start} ~ ${end}）`);
  L.push('');
  L.push(`期间共 ${dailyOut.length} 条出水测量、${infs.length} 条进水记录，涉及 ${activeReactors.length} 个罐。`);
  L.push('');

  // 每罐每指标聚合
  for (const r of activeReactors) {
    const lines: string[] = [];
    let anyRow = false;
    for (const ind of activeIndicators) {
      const outs = dailyOut.filter((m) => m.indicatorId === ind.id && m.reactorId === r.id);
      if (outs.length === 0) continue;
      anyRow = true;
      const outVals = outs.map((o) => o.value!).filter((v) => v != null);
      const outMean = mean(outVals);
      const overCount =
        outVals.filter(
          (v) => (ind.refLow != null && v < ind.refLow) || (ind.refHigh != null && v > ind.refHigh),
        ).length;
      // 进水：perReactor 优先，否则 shared
      const ownIn = infs.filter((i) => i.indicatorId === ind.id && i.reactorId === r.id);
      const sharedIn = infs.filter((i) => i.indicatorId === ind.id && i.reactorId == null);
      const inSrc = ownIn.length > 0 ? ownIn : sharedIn;
      const inMean = mean(inSrc.map((i) => i.value!));
      const rate = removalRate(inMean, outMean);
      // 达标率（refHigh 视为上限）
      let attainment: number | null = null;
      if (ind.refHigh != null && outVals.length > 0) {
        attainment = (outVals.filter((v) => v <= ind.refHigh!).length / outVals.length) * 100;
      }
      lines.push(
        `  · ${ind.name}${ind.unit ? `(${ind.unit})` : ''}：进水均值 ${num(inMean)} → 出水均值 ${num(outMean)}，去除率 ${rate == null ? '—' : num(rate) + '%'}` +
          (attainment != null ? `，达标率 ${num(attainment)}%` : '') +
          (overCount > 0 ? `（${overCount} 次超参考）` : '') +
          `（${outs.length} 次）`,
      );
    }
    if (anyRow) {
      L.push(`【${r.code}】`);
      L.push(...lines);
      L.push('');
    }
  }

  // 异常记录（含超范围原因标注，如有）
  const abnormal: string[] = [];
  for (const m of dailyOut) {
    const ind = indicators.find((i) => i.id === m.indicatorId);
    if (!ind) continue;
    const low = ind.refLow;
    const high = ind.refHigh;
    const over = (low != null && m.value! < low) || (high != null && m.value! > high);
    if (over) {
      const rc = activeReactors.find((r) => r.id === m.reactorId)?.code ?? `#${m.reactorId}`;
      const cause = m.note?.trim();
      abnormal.push(
        `  · ${m.date} ${rc} ${ind.name} = ${num(m.value, 2)}（参考 ${low ?? '—'}~${high ?? '—'}）` +
          (cause ? `　原因：${cause}` : ''),
      );
    }
  }
  L.push(`【异常记录】${abnormal.length > 0 ? '' : '无超参考范围数据'}`);
  if (abnormal.length > 0) L.push(...abnormal);
  L.push('');

  // 备注
  const notes = Array.from(dayNotes.entries())
    .filter(([d]) => inWin(d))
    .sort((a, b) => a[0].localeCompare(b[0]));
  L.push(`【当日备注】${notes.length > 0 ? '' : '无'}`);
  for (const [d, n] of notes) L.push(`  · ${d}：${n}`);
  L.push('');

  L.push(`（自动生成，数据截至 ${end}；单次测量超参考范围会标注）`);
  return L.join('\n');
}

/** 最近 N 天的起止（含今天） */
export function recentWindow(days: number, now = new Date()): { start: string; end: string } {
  const end = now;
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}
