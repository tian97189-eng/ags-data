/**
 * 本地(IndexedDB) ↔ 云端(CloudBase) 双向同步引擎
 *
 * 核心思想：UI 照常读写本地 IndexedDB（页面代码零改动），本引擎在底层搬运：
 *  - 本地变化（Dexie hooks）→ 推送到云端
 *  - 云端变化（watch 实时监听）→ 写回本地，页面 useLiveQuery 自动刷新
 *  - 离线期间的修改 → 存入待同步队列，重连后自动补传
 *  - 启动/手动同步 → 双向对账（本地独有推云端、云端独有拉本地、两端都有的以云端为准）
 *
 * 防循环：云端的写回用 pendingPush 集合标记，本地 hook 见到标记即跳过推送。
 */
import { db } from '../db/schema';
import {
  COLLECTIONS,
  initCloud,
  disposeCloud,
  cloudAdd,
  cloudGet,
  cloudUpdateByLocalId,
  cloudRemoveByLocalId,
  cloudFindByLocalId,
  cloudWatch,
  formatError,
  type CloudCollection,
} from './cloud';

export type SyncStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface SyncState {
  status: SyncStatus;
  envId: string;
  lastSyncAt: number | null;
  lastError: string;
  pendingOps: number; // 待同步队列长度
}

export const syncState: SyncState = {
  status: 'idle',
  envId: '',
  lastSyncAt: null,
  lastError: '',
  pendingOps: 0,
};

type Listener = (s: SyncState) => void;
const listeners = new Set<Listener>();
function emit() {
  for (const fn of listeners) {
    try {
      fn({ ...syncState });
    } catch {
      /* 忽略监听器错误 */
    }
  }
}
export function onSyncStateChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

type SyncOp = {
  collection: CloudCollection;
  op: 'add' | 'update' | 'delete';
  localId?: number;
  payload?: Record<string, unknown> & { id?: number };
};

let running = false;
let unwatchFns: Array<() => void> = [];
let offHooks: Array<() => void> = [];
const pendingPush = new Set<string>();

const keyOf = (collection: string, localId: number | null | undefined) =>
  `${collection}:${localId}`;

// ---------- 待同步队列（离线补传） ----------

async function loadQueue(): Promise<SyncOp[]> {
  const s = await db.settings.get('syncQueue');
  return (s?.value as SyncOp[]) ?? [];
}

async function saveQueue(list: SyncOp[]): Promise<void> {
  await db.settings.put({ key: 'syncQueue', value: list });
  syncState.pendingOps = list.length;
  emit();
}

async function enqueue(op: SyncOp): Promise<void> {
  const list = await loadQueue();
  list.push(op);
  await saveQueue(list);
}

/** 重放离线队列：逐条重试，仍失败的留在队列 */
async function replayQueue(): Promise<void> {
  const list = await loadQueue();
  if (!list.length) return;
  const rest: SyncOp[] = [];
  for (const op of list) {
    try {
      if (op.op === 'add' && op.payload) {
        const id = op.payload.id;
        if (id != null) {
          const exists = await cloudFindByLocalId(op.collection, id);
          if (!exists) {
            const { id: _i, ...payload } = op.payload;
            await cloudAdd(op.collection, { ...payload, localId: id });
          }
        } else {
          await cloudAdd(op.collection, { ...op.payload, localId: undefined });
        }
      } else if (op.op === 'update' && op.localId != null) {
        const table = (db as any)[op.collection];
        const fresh = await table.get(op.localId);
        if (fresh) {
          const { id: _i, ...payload } = fresh;
          await cloudUpdateByLocalId(op.collection, op.localId, payload);
        }
      } else if (op.op === 'delete' && op.localId != null) {
        await cloudRemoveByLocalId(op.collection, op.localId);
      }
    } catch {
      rest.push(op);
    }
  }
  await saveQueue(rest);
}

// ---------- 本地 → 云端（Dexie hooks 捕获） ----------

function startLocalHooks(): void {
  for (const table of db.tables) {
    const collection = table.name as CloudCollection;
    if (!(COLLECTIONS as readonly string[]).includes(collection)) continue; // settings 表不同步

    const creatingFn = (_primKey: unknown, obj: any) => {
      // 新增：等事务提交后 id 生成，再从本地表按内容匹配找到该记录推送
      setTimeout(() => {
        void (async () => {
          try {
            const rows = await table.toArray();
            const strip = (r: any) => {
              const { id: _i, ...rest } = r;
              return JSON.stringify(rest);
            };
            const match = rows.find(
              (r: any) => r.id != null && strip(r) === strip(obj),
            );
            if (!match) return;
            const localId = match.id as number;
            const exists = await cloudFindByLocalId(collection, localId);
            if (exists) return; // 已在云端（可能是自己 watch 回写）
            const { id: _i, ...payload } = match;
            await cloudAdd(collection, { ...payload, localId });
          } catch {
            const { id: _i, ...payload } = obj;
            await enqueue({ collection, op: 'add', payload: { ...payload, id: (obj as any).id } });
          }
        })();
      }, 0);
    };

    const updatingFn = (_modifications: unknown, primKey: unknown) => {
      const k = keyOf(collection, primKey as number);
      if (pendingPush.has(k)) {
        pendingPush.delete(k);
        return;
      }
      setTimeout(() => {
        void (async () => {
          try {
            const fresh = await table.get(primKey as number);
            if (!fresh) return;
            const { id: _i, ...payload } = fresh;
            await cloudUpdateByLocalId(collection, primKey as number, payload);
          } catch {
            await enqueue({ collection, op: 'update', localId: primKey as number });
          }
        })();
      }, 0);
    };

    const deletingFn = (primKey: unknown) => {
      const k = keyOf(collection, primKey as number);
      if (pendingPush.has(k)) {
        pendingPush.delete(k);
        return;
      }
      setTimeout(() => {
        void (async () => {
          try {
            await cloudRemoveByLocalId(collection, primKey as number);
          } catch {
            await enqueue({ collection, op: 'delete', localId: primKey as number });
          }
        })();
      }, 0);
    };

    table.hook('creating', creatingFn);
    table.hook('updating', updatingFn);
    table.hook('deleting', deletingFn);
    offHooks.push(() => {
      table.hook.creating.unsubscribe(creatingFn);
      table.hook.updating.unsubscribe(updatingFn);
      table.hook.deleting.unsubscribe(deletingFn);
    });
  }
}

// ---------- 云端 → 本地（watch 实时监听 + 写回） ----------

/** 把云端文档写回本地（带防循环标记） */
async function writeLocal(table: any, cloudDoc: Record<string, any>, localId: number): Promise<void> {
  const { _id, localId: _l, syncedAt, ...rest } = cloudDoc;
  const k = keyOf(table.name, localId);
  pendingPush.add(k);
  await table.put({ ...rest, id: localId });
  pendingPush.delete(k);
}

function startWatch(): void {
  unwatchFns = COLLECTIONS.map((collection) => {
    return cloudWatch(
      collection,
      (snapshot) => {
        void applySnapshot(collection, snapshot);
      },
      () => {
        // watch 断线由 SDK 自动重连，无需处理
      },
    );
  });
}

async function applySnapshot(collection: CloudCollection, snapshot: any): Promise<void> {
  const table = (db as any)[collection];
  for (const change of snapshot.docChanges ?? []) {
    const dataType = change.dataType as string;
    if (dataType === 'limit') continue;
    const doc: Record<string, any> = change.doc ?? {};
    const localId = doc.localId;
    if (localId == null) continue;
    if (dataType === 'remove') {
      const k = keyOf(collection, localId);
      pendingPush.add(k);
      await table.delete(localId);
      pendingPush.delete(k);
      continue;
    }
    const existing = await table.get(localId);
    if (existing) {
      const { _id, localId: _l, syncedAt, ...rest } = doc;
      const { id: _i, ...localRest } = existing;
      if (JSON.stringify(rest) === JSON.stringify(localRest)) continue; // 无变化
    }
    await writeLocal(table, doc, localId);
  }
}

// ---------- 双向对账（启动 / 手动同步） ----------

async function reconcile(): Promise<void> {
  for (const collection of COLLECTIONS) {
    const docs = await cloudGet(collection);
    const table = (db as any)[collection];
    const cloudByLocalId = new Map<number, Record<string, any>>();
    for (const d of docs) {
      if (d.localId != null) cloudByLocalId.set(d.localId as number, d);
    }
    const localRows: Array<Record<string, any>> = await table.toArray();
    const localIds = new Set(localRows.map((r) => r.id as number));

    // 1) 云端独有 → 拉本地
    for (const [localId, cdoc] of cloudByLocalId) {
      if (!localIds.has(localId)) {
        await writeLocal(table, cdoc, localId);
      }
    }
    // 2) 本地独有 → 推云端
    for (const row of localRows) {
      const cdoc = cloudByLocalId.get(row.id as number);
      if (!cdoc) {
        const { id, ...payload } = row;
        await cloudAdd(collection, { ...payload, localId: id });
      }
    }
    // 3) 两端都有 → 云端为准覆盖本地
    for (const row of localRows) {
      const cdoc = cloudByLocalId.get(row.id as number);
      if (!cdoc) continue;
      const { _id, localId: _l, syncedAt, ...crest } = cdoc;
      const { id: _i, ...lrest } = row;
      if (JSON.stringify(crest) !== JSON.stringify(lrest)) {
        await writeLocal(table, cdoc, row.id as number);
      }
    }
  }
}

// ---------- 生命周期 ----------

export async function initSync(envId: string, accessKey: string): Promise<void> {
  if (running) return;
  syncState.status = 'connecting';
  syncState.envId = envId;
  syncState.lastError = '';
  emit();
  try {
    await initCloud(envId, accessKey);
    await replayQueue(); // 先补传离线修改
    await reconcile(); // 再双向对账
    startWatch();
    startLocalHooks();
    running = true;
    syncState.status = 'connected';
    syncState.lastSyncAt = Date.now();
    emit();
  } catch (err) {
    running = false;
    syncState.status = 'error';
    syncState.lastError = formatError(err);
    emit();
    throw err;
  }
}

export function stopSync(): void {
  running = false;
  unwatchFns.forEach((fn) => fn());
  unwatchFns = [];
  offHooks.forEach((fn) => fn());
  offHooks = [];
  disposeCloud();
  syncState.status = 'idle';
  emit();
}

export function isSyncing(): boolean {
  return running;
}

/** 手动触发一次全量对账 */
export async function syncNow(): Promise<void> {
  if (!running) return;
  syncState.status = 'connecting';
  emit();
  try {
    await replayQueue();
    await reconcile();
    syncState.status = 'connected';
    syncState.lastSyncAt = Date.now();
    emit();
  } catch (err) {
    syncState.status = 'error';
    syncState.lastError = formatError(err);
    emit();
    throw err;
  }
}

/** 读取已保存的环境 ID */
export async function getSavedEnvId(): Promise<string> {
  const s = await db.settings.get('cloudEnvId');
  return (s?.value as string) ?? '';
}

/** 读取已保存的 API 密钥 */
export async function getSavedAccessKey(): Promise<string> {
  const s = await db.settings.get('cloudAccessKey');
  return (s?.value as string) ?? '';
}

/** 保存环境 ID 和 API 密钥（不自动连接） */
export async function saveEnvId(envId: string): Promise<void> {
  await db.settings.put({ key: 'cloudEnvId', value: envId.trim() });
}

export async function saveAccessKey(accessKey: string): Promise<void> {
  await db.settings.put({ key: 'cloudAccessKey', value: accessKey.trim() });
}
