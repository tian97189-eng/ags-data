import { db, type Measurement, type Phase, type Scene } from '../db/schema';

export interface QueryFilter {
  dateFrom?: string;
  dateTo?: string;
  reactorIds?: number[];
  indicatorIds?: number[];
  scene?: Scene | 'all';
  phase?: Phase;
  keyword?: string;
}

export function matchFilter(m: Measurement, f: QueryFilter): boolean {
  if (f.dateFrom && m.date < f.dateFrom) return false;
  if (f.dateTo && m.date > f.dateTo) return false;
  if (f.reactorIds && f.reactorIds.length > 0 && !f.reactorIds.includes(m.reactorId)) return false;
  if (f.indicatorIds && f.indicatorIds.length > 0 && !f.indicatorIds.includes(m.indicatorId)) return false;
  if (f.scene && f.scene !== 'all' && m.scene !== f.scene) return false;
  if (f.phase && m.phase !== f.phase) return false;
  if (f.keyword && f.keyword.trim() !== '' && !(m.note ?? '').includes(f.keyword.trim())) return false;
  return true;
}

export async function queryMeasurements(f: QueryFilter): Promise<Measurement[]> {
  const all = await db.measurements.toArray();
  return all.filter((m) => matchFilter(m, f));
}

export type SortKey = 'date' | 'value' | 'reactorId' | 'indicatorId';
export type SortDir = 'asc' | 'desc';

export function sortMeasurements(rows: Measurement[], key: SortKey, dir: SortDir): Measurement[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
}
