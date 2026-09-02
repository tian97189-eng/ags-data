import { db } from '../db/schema';
import type { Measurement } from '../db/schema';

/**
 * 回收站：删除数据先进回收站（JSON 快照保原 id），30 天内可恢复，超期自动清理。
 * 支持表：measurements / influents / defaults（其余表新增时在 restoreTrash 里补写回逻辑）。
 */

const TTL_DAYS = 30;

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

/** 回收站列表（新→旧） */
export async function listTrash(): Promise<{ id: number; count: number; table: string; deletedAt: string }[]> {
  const all = await db.trashRecords.orderBy('deletedAt').reverse().toArray();
  return all.map((t) => {
    let count = 0;
    try {
      const parsed = JSON.parse(t.data);
      if (Array.isArray(parsed)) count = parsed.length;
    } catch {
      count = 0;
    }
    return { id: t.id!, count, table: t.table, deletedAt: t.deletedAt };
  });
}

/** 恢复一条回收站记录（写回原表后删除回收站条目）；返回恢复行数 */
export async function restoreTrash(trashId: number): Promise<number> {
  const t = await db.trashRecords.get(trashId);
  if (!t) return 0;
  const parsed = JSON.parse(t.data) as object[];
  if (!Array.isArray(parsed) || parsed.length === 0) return 0;
  if (t.table === 'measurements') {
    await db.measurements.bulkPut(parsed as Measurement[]);
    await db.trashRecords.delete(trashId);
    return parsed.length;
  }
  if (t.table === 'influents') {
    await db.influents.bulkPut(parsed as Parameters<typeof db.influents.bulkPut>[0]);
    await db.trashRecords.delete(trashId);
    return parsed.length;
  }
  if (t.table === 'defaults') {
    await db.defaults.bulkPut(parsed as Parameters<typeof db.defaults.bulkPut>[0]);
    await db.trashRecords.delete(trashId);
    return parsed.length;
  }
  return 0;
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
