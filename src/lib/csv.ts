import type { Measurement } from '../db/schema';

/**
 * 宽表 CSV（供 Origin / SPSS 直接拖入）：
 * - 行 = 日期（仅 scene=daily）
 * - 列 = 罐-指标 组合（如 R1_氨氮）
 * - 值 = 该日该罐该指标最后一次测量的浓度
 * 带 UTF-8 BOM，Excel/Origin 中文不乱码。
 */

function esc(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildWideCsv(
  measurements: Measurement[],
  reactorCodes: Map<number, string>,
  indicatorNames: Map<number, string>,
): string {
  // 只取日常数据
  const daily = measurements.filter((m) => m.scene === 'daily' && m.value != null);
  const dates = Array.from(new Set(daily.map((m) => m.date))).sort();

  // 列集合：罐-指标（保持 reactors/indicators 传入顺序）
  const colKeys: string[] = [];
  const colSet = new Set<string>();
  for (const m of daily) {
    const rc = reactorCodes.get(m.reactorId) ?? `#${m.reactorId}`;
    const ic = indicatorNames.get(m.indicatorId) ?? `#${m.indicatorId}`;
    const key = `${rc}_${ic}`;
    if (!colSet.has(key)) {
      colSet.add(key);
      colKeys.push(key);
    }
  }

  // 值表：date → colKey → value（同组多条取最后一次）
  const valueMap = new Map<string, Map<string, number>>();
  for (const m of daily) {
    const rc = reactorCodes.get(m.reactorId) ?? `#${m.reactorId}`;
    const ic = indicatorNames.get(m.indicatorId) ?? `#${m.indicatorId}`;
    const key = `${rc}_${ic}`;
    const row = valueMap.get(m.date) ?? new Map<string, number>();
    row.set(key, m.value!);
    valueMap.set(m.date, row);
  }

  const lines: string[] = [];
  lines.push(['date', ...colKeys].map(esc).join(','));
  for (const d of dates) {
    const row = valueMap.get(d)!;
    lines.push([d, ...colKeys.map((c) => row.get(c) ?? '')].join(','));
  }
  // BOM 前缀，便于 Excel/Origin 识别 UTF-8
  return '\uFEFF' + lines.join('\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
