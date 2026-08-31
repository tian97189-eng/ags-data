/**
 * LeanCloud 云数据库接入层（国内免费 Serverless 数据存储）
 *
 * 职责：初始化、游客登录（匿名）、集合 CRUD 封装、LiveQuery 实时监听。
 * 设计：本地 IndexedDB 仍是 UI 的数据源（页面代码不动），本模块负责
 *       把本地数据推到云端、把云端变化拉回本地（见 sync.ts）。
 *
 * 免费额度（开发版）：1GB 存储、3 万次请求/天、LiveQuery 100 订阅/天。
 *
 * 跨设备共享关键：所有对象设置「公共读写」ACL，任意设备（含游客）都可读写。
 * 未配置 AppID/AppKey 时，所有函数安全返回/失败，不影响纯本地使用。
 */
import AV from 'leancloud-storage';

let ready = false;
let publicACL: AV.ACL | null = null;

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

export interface CloudConfig {
  appId: string;
  appKey: string;
  serverURL?: string;
}

/** 已初始化且游客已登录 */
export function isCloudReady(): boolean {
  return ready && !!AV.User.current();
}

/** 是否已填入 AppID */
export function hasEnvId(envId?: string): boolean {
  return !!envId && envId.trim().length > 0;
}

/**
 * 把任意错误对象转成可读字符串。
 * SDK 经常抛非标准对象（带 code/error 字段），直接 err.message 会得到空或 [object Object]。
 */
export function formatError(err: unknown): string {
  if (!err) return '未知错误';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    if (err.message) return err.message;
    return `${err.name}: ${err.stack?.split('\n')[0] ?? err.toString()}`;
  }
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const msg = e.message ?? e.msg ?? e.errorMessage ?? e.errMsg;
    const code = e.code ?? e.errCode;
    if (msg && code) return `[${code}] ${String(msg)}`;
    if (msg) return String(msg);
    try {
      return JSON.stringify(err, null, 2);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * 初始化 LeanCloud 并登录（游客身份，无需注册）。
 * 所有对象使用公共读写 ACL，实现跨设备共享同一份数据。
 */
export async function initCloud(cfg: CloudConfig): Promise<void> {
  if (!cfg?.appId?.trim() || !cfg?.appKey?.trim()) {
    throw new Error('请先填写 AppID 和 AppKey');
  }
  if (ready && AV.User.current()) return;
  if (!AV.applicationId) {
    AV.init({
      appId: cfg.appId.trim(),
      appKey: cfg.appKey.trim(),
      ...(cfg.serverURL?.trim() ? { serverURL: cfg.serverURL.trim() } : {}),
    });
  }
  const user = AV.User.current();
  if (!user) {
    try {
      await AV.User.loginAnonymously();
    } catch (err) {
      throw new Error(`游客登录失败（如提示未开通，请到 LeanCloud 控制台「设置 → 安全设置」开启游客/匿名登录）：${formatError(err)}`);
    }
  }
  publicACL = new AV.ACL();
  publicACL.setPublicReadAccess(true);
  publicACL.setPublicWriteAccess(true);
  ready = true;
}

/** 退出并清理（供设置页停用云同步） */
export function disposeCloud(): void {
  ready = false;
  publicACL = null;
}

function requireReady(): void {
  if (!ready || !AV.User.current()) throw new Error('云同步未连接');
}

function toPlain(obj: AV.Object): Record<string, unknown> {
  return { ...obj.attributes, _id: obj.id } as Record<string, unknown>;
}

/** 新增一条文档（公共读写 ACL），返回云端 _id */
export async function cloudAdd(collection: CloudCollection, data: Record<string, unknown>): Promise<string> {
  requireReady();
  const { id: _i, _id: _d, ...rest } = data as Record<string, unknown>;
  const Obj = AV.Object.extend(collection);
  const o = new Obj();
  o.setAll({ ...rest, syncedAt: Date.now() });
  if (publicACL) o.setACL(publicACL);
  const saved = await o.save();
  return saved.id as string;
}

/** 按条件查集合（默认全量，最多 1000 条） */
export async function cloudGet(collection: CloudCollection, where?: Record<string, unknown>): Promise<any[]> {
  requireReady();
  const q = new AV.Query(collection);
  if (where) {
    for (const [k, v] of Object.entries(where)) {
      if (v === null || v === undefined) q.doesNotExist(k);
      else q.equalTo(k, v);
    }
  }
  q.limit(1000);
  const res = await q.find();
  return res.map((o) => toPlain(o));
}

/** 按 localId 条件更新一条文档 */
export async function cloudUpdateByLocalId(
  collection: CloudCollection,
  localId: number,
  data: Record<string, unknown>,
): Promise<void> {
  requireReady();
  const q = new AV.Query(collection);
  q.equalTo('localId', localId);
  q.limit(1);
  const res = await q.find();
  if (!res.length) return; // 云端没有（可能已被删），忽略
  const { id: _i, _id: _d, ...rest } = data as Record<string, unknown>;
  res[0].setAll({ ...rest, syncedAt: Date.now() });
  await res[0].save();
}

/** 按 localId 条件删除一条文档 */
export async function cloudRemoveByLocalId(collection: CloudCollection, localId: number): Promise<void> {
  requireReady();
  const q = new AV.Query(collection);
  q.equalTo('localId', localId);
  q.limit(1);
  const res = await q.find();
  if (res.length) await res[0].destroy();
}

/** 按 localId 查询云端文档（用于确认同步状态） */
export async function cloudFindByLocalId(collection: CloudCollection, localId: number): Promise<any | null> {
  requireReady();
  const q = new AV.Query(collection);
  q.equalTo('localId', localId);
  q.limit(1);
  const res = await q.find();
  return res.length ? toPlain(res[0]) : null;
}

export interface WatchSnapshot {
  docs: any[];
  docChanges: Array<{
    dataType: 'init' | 'add' | 'update' | 'remove' | 'replace' | 'limit';
    doc: Record<string, any>;
  }>;
}

/**
 * 实时监听一个集合的所有变化（LiveQuery）。
 * @returns 取消监听的函数
 */
export function cloudWatch(
  collection: CloudCollection,
  onChange: (snapshot: WatchSnapshot) => void,
  onError?: (err: unknown) => void,
): () => void {
  const q = new AV.Query(collection);
  let sub: { unsubscribe: () => void } | null = null;
  let closed = false;

  const emit = (dataType: WatchSnapshot['docChanges'][number]['dataType'], obj: AV.Object) => {
    if (closed) return;
    onChange({ docs: [], docChanges: [{ dataType, doc: toPlain(obj) }] });
  };

  q.subscribe()
    .then((s) => {
      if (closed) {
        s.unsubscribe();
        return;
      }
      sub = s;
      s.on('create', (obj: AV.Object) => emit('add', obj));
      s.on('update', (obj: AV.Object) => emit('update', obj));
      s.on('enter', (obj: AV.Object) => emit('add', obj));
      s.on('leave', (obj: AV.Object) => emit('remove', obj));
      s.on('delete', (obj: AV.Object) => emit('remove', obj));
      s.on('error', (err: unknown) => {
        if (!closed) onError?.(err);
      });
    })
    .catch((err: unknown) => {
      if (!closed) onError?.(err);
    });

  return () => {
    closed = true;
    try {
      sub?.unsubscribe();
    } catch {
      /* 忽略重复取消 */
    }
  };
}
