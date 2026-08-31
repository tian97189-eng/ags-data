import * as XLSX from 'xlsx';
import { db, type Measurement } from '../db/schema';

export interface ExportRow {
  日期: string;
  类型: string;
  时间: string;
  阶段: string;
  罐: string;
  指标: string;
  吸光度: number | null;
  空白: number | null;
  稀释: number | null;
  浓度: number | null;
  标曲: string;
  备注: string;
}

const PHASE_LABEL: Record<string, string> = {
  anaerobic: '厌氧',
  oxic: '好氧',
  anoxic: '缺氧',
};

/** Excel 导出过滤条件 */
export interface ExportFilter {
  /** 日期范围（含端点）。任一字段缺省表示该侧不限 */
  dateFrom?: string;
  dateTo?: string;
  /** 罐 id 列表。空数组=全部 */
  reactorIds?: number[];
  /** 指标 id 列表。空数组=全部 */
  indicatorIds?: number[];
}

/** 按条件过滤 + 把测量值转成含名称的导出行（含标曲追溯） */
export async function buildExportRows(measurements: Measurement[], filter: ExportFilter = {}): Promise<ExportRow[]> {
  const reactors = await db.reactors.toArray();
  const indicators = await db.indicators.toArray();
  const curves = await db.curves.toArray();
  const rMap = new Map(reactors.map((r) => [r.id, r]));
  const iMap = new Map(indicators.map((i) => [i.id, i]));
  const cMap = new Map(curves.map((c) => [c.id, c]));

  const rIds = filter.reactorIds ?? [];
  const iIds = filter.indicatorIds ?? [];

  return measurements
    .filter((m) => {
      if (filter.dateFrom && m.date < filter.dateFrom) return false;
      if (filter.dateTo && m.date > filter.dateTo) return false;
      if (rIds.length && !rIds.includes(m.reactorId)) return false;
      if (iIds.length && !iIds.includes(m.indicatorId)) return false;
      return true;
    })
    .map((m) => {
      const reactor = rMap.get(m.reactorId);
      const indicator = iMap.get(m.indicatorId);
      const curve = m.curveId != null ? cMap.get(m.curveId) : null;
      return {
        日期: m.date,
        类型: m.scene === 'daily' ? '日常' : '全周期',
        时间: m.time ?? '',
        阶段: m.phase ? PHASE_LABEL[m.phase] ?? '' : '',
        罐: reactor?.code ?? `#${m.reactorId}`,
        指标: indicator?.name ?? `#${m.indicatorId}`,
        吸光度: m.inputType === 'absorbance' ? m.sampleAbs : null,
        空白: m.blankAbs,
        稀释: m.dilution,
        浓度: m.value,
        标曲: curve ? `${curve.effectiveFrom} k=${curve.k}` : '',
        备注: m.note,
      };
    });
}

export function buildWorkbook(rows: ExportRow[]): XLSX.WorkBook {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '数据');
  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, filename);
}
