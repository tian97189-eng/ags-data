import * as XLSX from 'xlsx';
import { db, type Measurement, type MLSSRecord, type ParticleSizeRecord, type ParticleSizeRange, type EPSRecord } from '../db/schema';

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

export interface MLSSExportRow {
  日期: string;
  滤纸编号: string;
  M1滤纸重: number | null;
  M2滤纸泥坩埚: number | null;
  M3坩埚: number | null;
  M4灼烧残渣坩埚: number | null;
  V取样体积: number | null;
  MLSS: number | null;
  MLVSS: number | null;
  备注: string;
}

export interface ParticleExportRow {
  日期: string;
  区间: string;
  中位径: number | null;
  M1滤纸重: number | null;
  M2滤纸泥: number | null;
  泥重: number | null;
  占比: number | null;
  备注: string;
}

export interface EPSExportRow {
  日期: string;
  样品编号: string;
  VSS质量: number | null;
  PS样品吸光度: number | null;
  PS空白吸光度: number | null;
  PS稀释: number | null;
  PS浓度: number | null;
  PN样品吸光度: number | null;
  PN空白吸光度: number | null;
  PN稀释: number | null;
  PN浓度: number | null;
  提取液体积: number | null;
  PS含量: number | null;
  PN含量: number | null;
  PNPS比: number | null;
  备注: string;
}

const PHASE_LABEL: Record<string, string> = {
  anaerobic: '厌氧',
  oxic: '好氧',
  anoxic: '缺氧',
};

function rangeLabel(r: ParticleSizeRange): string {
  if (!isFinite(r.to)) return `>${r.from} μm`;
  if (r.from === 0) return `<${r.to} μm`;
  return `${r.from}-${r.to} μm`;
}

/** Excel 导出过滤条件 */
export interface ExportFilter {
  /** 日期范围（含端点）。任一字段缺省表示该侧不限 */
  dateFrom?: string;
  dateTo?: string;
  /** 罐 id 列表。空数组=全部 */
  reactorIds?: number[];
  /** 指标 id 列表。空数组=全部 */
  indicatorIds?: number[];
  /** 是否包含「其他指标」sheet（污泥浓度/粒径/EPS）；默认 true */
  includeExtras?: boolean;
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

/** 污泥浓度导出 */
export async function buildMLSSExport(filter: ExportFilter = {}): Promise<MLSSExportRow[]> {
  let rows = await db.mlssRecords.orderBy('date').reverse().toArray();
  rows = rows.filter((r) => {
    if (filter.dateFrom && r.date < filter.dateFrom) return false;
    if (filter.dateTo && r.date > filter.dateTo) return false;
    return true;
  });
  return rows.map((r) => ({
    日期: r.date,
    滤纸编号: r.paperNo,
    M1滤纸重: r.m1,
    M2滤纸泥坩埚: r.m2,
    M3坩埚: r.m3,
    M4灼烧残渣坩埚: r.m4,
    V取样体积: r.v,
    MLSS: r.mlss,
    MLVSS: r.mlvss,
    备注: r.note,
  }));
}

/** 筛分粒径导出 */
export async function buildParticleExport(filter: ExportFilter = {}): Promise<ParticleExportRow[]> {
  const ranges = await db.particleSizeRanges.orderBy('sortOrder').toArray();
  const rMap = new Map(ranges.map((r) => [r.id!, r]));
  let rows = await db.particleSizeRecords.orderBy('date').reverse().toArray();
  rows = rows.filter((r) => {
    if (filter.dateFrom && r.date < filter.dateFrom) return false;
    if (filter.dateTo && r.date > filter.dateTo) return false;
    return true;
  });
  return rows.map((r) => {
    const rng = r.rangeId != null ? rMap.get(r.rangeId) : null;
    return {
      日期: r.date,
      区间: rng ? rangeLabel(rng) : '',
      中位径: rng?.mid ?? null,
      M1滤纸重: r.paperWeight,
      M2滤纸泥: r.sampleWeight,
      泥重: r.dryWeight,
      占比: r.percent,
      备注: r.note,
    };
  });
}

/** EPS 导出 */
export async function buildEPSExport(filter: ExportFilter = {}): Promise<EPSExportRow[]> {
  let rows = await db.epsRecords.orderBy('date').reverse().toArray();
  rows = rows.filter((r) => {
    if (filter.dateFrom && r.date < filter.dateFrom) return false;
    if (filter.dateTo && r.date > filter.dateTo) return false;
    return true;
  });
  return rows.map((r) => ({
    日期: r.date,
    样品编号: r.sampleCode,
    VSS质量: r.vssMg,
    PS样品吸光度: r.psSampleAbs,
    PS空白吸光度: r.psBlankAbs,
    PS稀释: r.psDilution,
    PS浓度: r.psConc,
    PN样品吸光度: r.pnSampleAbs,
    PN空白吸光度: r.pnBlankAbs,
    PN稀释: r.pnDilution,
    PN浓度: r.pnConc,
    提取液体积: r.extractVolume,
    PS含量: r.psContent,
    PN含量: r.pnContent,
    PNPS比: r.pnPsRatio,
    备注: r.note,
  }));
}

/** 多 sheet 工作簿（含其他指标 3 个 sheet） */
export async function buildFullWorkbook(
  measurements: Measurement[],
  filter: ExportFilter = {},
): Promise<{ wb: XLSX.WorkBook; counts: { sheets: number[]; total: number } }> {
  const dataRows = await buildExportRows(measurements, filter);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataRows), '测量数据');

  const includeExtras = filter.includeExtras !== false;
  const counts = [dataRows.length];

  if (includeExtras) {
    const mlss = await buildMLSSExport(filter);
    if (mlss.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mlss), '污泥浓度');
      counts.push(mlss.length);
    }
    const particle = await buildParticleExport(filter);
    if (particle.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(particle), '筛分粒径');
      counts.push(particle.length);
    }
    const eps = await buildEPSExport(filter);
    if (eps.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eps), 'EPS');
      counts.push(eps.length);
    }
  }
  return { wb, counts: { sheets: counts, total: counts.reduce((s, n) => s + n, 0) } };
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
