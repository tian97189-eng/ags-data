import type { Scene } from '../db/schema';

/** 查询页快捷筛选预设：把常用筛选条件存成一键按钮（localStorage 持久化） */

export interface QueryFilter {
  dateFrom: string;
  dateTo: string;
  reactorIds: number[];
  indicatorIds: number[];
  scene: Scene | 'all';
  phase: string;
  keyword: string;
}

export interface QueryPreset {
  name: string;
  f: QueryFilter;
}

const KEY = 'query.presets.v1';

export function loadPresets(): QueryPreset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as QueryPreset[];
    if (!Array.isArray(list)) return [];
    return list.filter((p) => p && typeof p.name === 'string' && p.f);
  } catch {
    return [];
  }
}

function persist(list: QueryPreset[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** 保存（同名覆盖旧的）；返回保存后的完整列表 */
export function savePreset(name: string, f: QueryFilter): QueryPreset[] {
  const list = loadPresets();
  const rest = list.filter((p) => p.name !== name);
  persist([...rest, { name, f }]);
  return loadPresets();
}

/** 删除；返回剩余列表 */
export function deletePreset(name: string): QueryPreset[] {
  const list = loadPresets().filter((p) => p.name !== name);
  persist(list);
  return list;
}
