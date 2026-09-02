/**
 * 录入草稿自动保存
 * - 录入页每次改动 debounce 后写入 localStorage（单槽，带日期）
 * - 重新进入时若该日期「数据库无已保存数据」且存在草稿 → 提示恢复
 * - 纯函数应便于单测
 */

export interface DraftPayload {
  date: string;
  /** 草稿相对数据（每格输入），由页面提供 */
  defaults: Record<number, { blank: string; dilution: string }>;
  cells: Record<string, { sample: string; dilution: string; dilutionOverridden: boolean }>;
  /** 进水面板快照 */
  influent?: { dilution: Record<number, string>; samples: Record<string, string> };
}

export interface Draft extends DraftPayload {
  savedAt: number;
}

const KEY = 'ags-entry-draft';

/** 旧 API：固定 key（录入页用），由 saveDraftFor(KEY, ...) 委托 */
export function saveDraft(payload: DraftPayload): void {
  saveDraftFor(KEY, payload);
}
export function loadDraft(): Draft | null {
  return loadDraftFor(KEY);
}
export function clearDraft(): void {
  clearDraftFor(KEY);
}

/** 泛化 API：多页面（OtherEntry 等）各自用自己的 key 隔离 */
export function saveDraftFor(key: string, payload: DraftPayload): void {
  try {
    const d: Draft = { ...payload, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}
export function loadDraftFor(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d.date !== 'string' || d.savedAt == null) return null;
    return d;
  } catch {
    return null;
  }
}
export function clearDraftFor(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 通用 JSON 草稿（各页自定义结构，key 隔离）。payload 任意可序列化对象，savedAt 自动注入 */
export interface AnyDraft {
  savedAt: number;
  [k: string]: unknown;
}
export function saveAnyDraft(key: string, payload: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, savedAt: Date.now() }));
  } catch {
    /* 超限/不可用则静默（如照片 base64 太大时调用方应先降级为只存文本） */
  }
}
export function loadAnyDraft(key: string): AnyDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as AnyDraft;
    if (!d || typeof d !== 'object' || typeof d.savedAt !== 'number') return null;
    return d;
  } catch {
    return null;
  }
}

/** 草稿是否为空（没有任何用户输入，无需保存/恢复） */
export function isDraftEmpty(p: Pick<DraftPayload, 'defaults' | 'cells' | 'influent'>): boolean {
  const hasBlank = Object.values(p.defaults ?? {}).some((x) => (x?.blank ?? '') !== '');
  // cells 里的 dilution 默认预填不算输入，仅用户手动覆盖(dilutionOverridden)或填了 sample 才算
  const hasSample = Object.values(p.cells ?? {}).some((x) => (x?.sample ?? '') !== '');
  const hasOverriddenDil = Object.values(p.cells ?? {}).some(
    (x) => x?.dilutionOverridden === true,
  );
  const hasInf = Object.values(p.influent?.samples ?? {}).some((v) => v !== '');
  return !hasBlank && !hasSample && !hasOverriddenDil && !hasInf;
}

/**
 * 是否应提示恢复草稿：
 * - 有草稿
 * - 草稿日期 == 当前编辑日期
 * - 数据库里该日期还没有任何已保存数据（避免覆盖已保存内容）
 */
export function shouldOfferRestore(
  draft: Draft | null | undefined,
  date: string,
  hasDbData: boolean,
): boolean {
  if (!draft) return false;
  if (draft.date !== date) return false;
  if (hasDbData) return false;
  return true;
}
