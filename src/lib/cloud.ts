/**
 * CloudBase 云数据库接入层（腾讯云开发）
 *
 * 职责：初始化云环境、匿名登录、集合 CRUD 封装、watch 实时监听。
 * 设计：本地 IndexedDB 仍是 UI 的数据源（页面代码不动），本模块负责
 *       把本地数据推到云端、把云端变化拉回本地（见 sync.ts）。
 *
 * 未配置 envId 时，所有函数安全地返回空/失败，不影响纯本地使用。
 */
import cloudbase from '@cloudbase/js-sdk';

let app: any = null;
let cdb: any = null;
let authed = false;

/** 集合名与本地 Dexie 表一一对应 */
export const COLLECTIONS = [
  'reactors',
  'indicators',
  'curves',
  'cycles',
  'measurements',
  'influents',
  'defaults',
  'customRecords',
] as const;

export type CloudCollection = (typeof COLLECTIONS)[number];

/** 已配置（填过 envId）且已初始化 */
export function isCloudReady(): boolean {
  return !!cdb && authed;
}

/** 是否已填入环境 ID（未初始化也算） */
export function hasEnvId(envId?: string): boolean {
  return !!envId && envId.trim().length > 0;
}

/**
 * 初始化云环境并匿名登录。
 * 匿名登录：用户无需注册账号，CloudBase 自动分配匿名身份；
 * 集合权限设为「所有用户可读写」即可跨设备共享同一份数据。
 */
export async function initCloud(envId: string): Promise<void> {
  if (!hasEnvId(envId)) throw new Error('请先填写云环境 ID');
  if (app && authed) return; // 已就绪
  if (!app) {
    app = cloudbase.init({ env: envId.trim() });
  }
  cdb = app.database();
  const auth = app.auth();
  const state = auth.getLoginState();
  if (state) {
    authed = true;
    return;
  }
  await auth.signInAnonymously();
  authed = true;
}

/** 退出并清理（供设置页停用云同步） */
export function disposeCloud(): void {
  app = null;
  cdb = null;
  authed = false;
}

function requireDb(): any {
  if (!cdb || !authed) throw new Error('云同步未连接');
  return cdb;
}

/** 新增一条文档，返回云端 _id */
export async function cloudAdd(collection: CloudCollection, data: Record<string, unknown>): Promise<string> {
  const db = requireDb();
  const res = await db.collection(collection).add({ ...data, syncedAt: Date.now() });
  return res._id as string;
}

/** 按条件查集合（默认全量，最多 1000 条） */
export async function cloudGet(collection: CloudCollection, where?: Record<string, unknown>): Promise<any[]> {
  const db = requireDb();
  const query = where ? db.collection(collection).where(where) : db.collection(collection);
  const res = await query.limit(1000).get();
  return res.data as any[];
}

/** 按 localId 条件更新一条文档 */
export async function cloudUpdateByLocalId(
  collection: CloudCollection,
  localId: number,
  data: Record<string, unknown>,
): Promise<void> {
  const db = requireDb();
  await db
    .collection(collection)
    .where({ localId })
    .update({ ...data, syncedAt: Date.now() });
}

/** 按 localId 条件删除一条文档 */
export async function cloudRemoveByLocalId(collection: CloudCollection, localId: number): Promise<void> {
  const db = requireDb();
  await db.collection(collection).where({ localId }).remove();
}

/** 按 localId 查询云端文档（用于确认同步状态） */
export async function cloudFindByLocalId(collection: CloudCollection, localId: number): Promise<any | null> {
  const db = requireDb();
  const res = await db.collection(collection).where({ localId }).limit(1).get();
  return (res.data as any[])[0] ?? null;
}

export interface WatchSnapshot {
  docs: any[];
  docChanges: Array<{
    dataType: 'init' | 'add' | 'update' | 'remove' | 'replace' | 'limit';
    doc: Record<string, any>;
  }>;
}

/**
 * 实时监听一个集合的所有变化。
 * @returns 取消监听的函数
 */
export function cloudWatch(
  collection: CloudCollection,
  onChange: (snapshot: WatchSnapshot) => void,
  onError?: (err: unknown) => void,
): () => void {
  const db = requireDb();
  let closed = false;
  const cancel = db
    .collection(collection)
    .where({})
    .watch({
      onChange: (snapshot: WatchSnapshot) => {
        if (!closed) onChange(snapshot);
      },
      onError: (err: unknown) => {
        if (!closed) onError?.(err);
      },
    });
  return () => {
    closed = true;
    try {
      cancel?.();
    } catch {
      /* 忽略重复取消 */
    }
  };
}
