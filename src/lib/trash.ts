import { db } from '../db/schema';
import type {
  Measurement,
  Influent,
  DailyDefault,
  OtherMeasurement,
  MLSSRecord,
  EPSRecord,
  SVIRecord,
  ParticleSizeRecord,
  ParticleSizeRange,
  ExperimentRecord,
  CalibrationCurve,
} from '../db/schema';

/**
 * 回收站：删除数据先进回收站（JSON 快照保原 id），30 天内可恢复，超期自动清理。
 * 支持所有业务表（measurements / influents / defaults / otherMeasurements /
 * mlssRecords / epsRecords / sviRecords / particleSizeRecords / particleSizeRanges /
 * experimentRecords / curves / otherReactors 等）。
 *
 * 分组（用户可读的分类）：同一条回收站记录属于一个业务分组，用于「数据录入 / 全周期 /
 * 其他指标（污泥浓度/筛分粒径/沉降性/EPS）/ 他人数据 / 实验记录 / 标准曲线」分类恢复。
 */

const TTL_DAYS = 30;

/** 业务分组：用于回收站分类展示（从被删行推断，不在表结构硬存，向后兼容旧记录） */
export type TrashGroup =
  | 'daily' // 数据录入（出水/进水 daily）
  | 'cycle' // 全周期（measurements scene=cycle）
  | 'other' // 他人数据（otherMeasurements）
  | 'mlss'
  | 'particle'
  | 'svi'
  | 'eps'
  | 'experiment' // 实验记录
  | 'curve' // 标准曲线
  | 'params'; // 参数（反应器/他人罐等）

/** 分组中文名（回收站分类标题用） */
export const TRASH_GROUP_LABEL: Record<TrashGroup, string> = {
  daily: '数据录入',
  cycle: '全周期',
  other: '他人数据',
  mlss: '污泥浓度',
  particle: '筛分粒径',
  svi: '污泥沉降性',
  eps: 'EPS（PS/PN）',
  experiment: '实验记录',
  curve: '标准曲线',
  params: '参数管理',
};

/** 从被删行推断分组（无 scene 字段的表按表名归组） */
export function groupForRows(table: string, rows: object[]): TrashGroup {
  const first = rows[0] as { scene?: string } | null;
  if (table === 'measurements') {
    return first?.scene === 'cycle' ? 'cycle' : 'daily';
  }
  switch (table) {
    case 'influents':
    case 'defaults':
      return 'daily';
    case 'otherMeasurements':
    case 'otherReactors':
      return 'other';
    case 'mlssRecords':
      return 'mlss';
    case 'particleSizeRecords':
    case 'particleSizeRanges':
      return 'particle';
    case 'sviRecords':
      return 'svi';
    case 'epsRecords':
      return 'eps';
    case 'experimentRecords':
      return 'experiment';
    case 'curves':
      return 'curve';
    case 'reactors':
    case 'indicators':
      return 'params';
    default:
      return 'daily';
  }
}

/** 把整组记录移入回收站（数据仍由调用方负责从原表删除） */
export async function trashMeasurements(rows: Measurement[]): Promise<number> {
  return trashRows('measurements', rows);
}

/** 通用：把任意表的多行记录存为一条回收站条目；返回行数 */
export async function trashRows(table: string, rows: object[]): Promise<number> {
  if (rows.length === 0) return 0;
  await db.trashRecords.add({
    table,
    data: JSON.stringify(rows),
    deletedAt: new Date().toISOString(),
  });
  return rows.length;
}

export interface TrashListItem {
  id: number;
  count: number;
  table: string;
  group: TrashGroup;
  deletedAt: string;
}

/** 回收站列表（新→旧） */
export async function listTrash(): Promise<TrashListItem[]> {
  const all = await db.trashRecords.orderBy('deletedAt').reverse().toArray();
  return all.map((t) => {
    let count = 0;
    let group: TrashGroup = 'daily';
    try {
      const parsed = JSON.parse(t.data);
      if (Array.isArray(parsed)) {
        count = parsed.length;
        if (parsed.length > 0) group = groupForRows(t.table, parsed as object[]);
      }
    } catch {
      count = 0;
    }
    return { id: t.id!, count, table: t.table, group, deletedAt: t.deletedAt };
  });
}

/** 可写回的 Dexie 表（key=表名） */
type BulkTable = { bulkPut: (rows: unknown[]) => Promise<unknown> };
const TABLES: Record<string, BulkTable> = {
  measurements: db.measurements,
  influents: db.influents,
  defaults: db.defaults,
  otherMeasurements: db.otherMeasurements,
  mlssRecords: db.mlssRecords,
  epsRecords: db.epsRecords,
  sviRecords: db.sviRecords,
  particleSizeRecords: db.particleSizeRecords,
  particleSizeRanges: db.particleSizeRanges,
  experimentRecords: db.experimentRecords,
  curves: db.curves,
  otherReactors: db.otherReactors,
  reactors: db.reactors,
  indicators: db.indicators,
  cycles: db.cycles,
};

/** 恢复一条回收站记录（写回原表后删除回收站条目）；返回恢复行数 */
export async function restoreTrash(trashId: number): Promise<number> {
  const t = await db.trashRecords.get(trashId);
  if (!t) return 0;
  const parsed = JSON.parse(t.data) as object[];
  if (!Array.isArray(parsed) || parsed.length === 0) return 0;
  const tbl = TABLES[t.table];
  if (!tbl) return 0;
  await tbl.bulkPut(parsed);
  await db.trashRecords.delete(trashId);
  return parsed.length;
}

/** 彻底删除一条回收站记录（不可恢复） */
export async function purgeTrash(trashId: number): Promise<void> {
  await db.trashRecords.delete(trashId);
}

/** 清空回收站（全部永久删除） */
export async function emptyTrash(): Promise<void> {
  await db.trashRecords.clear();
}

/** 清理超过 TTL 的回收站记录；返回清理条数 */
export async function purgeExpiredTrash(days = TTL_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const expired = await db.trashRecords.where('deletedAt').below(cutoff).toArray();
  if (expired.length === 0) return 0;
  await db.trashRecords.bulkDelete(expired.map((e) => e.id!));
  return expired.length;
}
