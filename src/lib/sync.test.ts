import { beforeEach, describe, it, expect, vi } from 'vitest';
import { db } from '../db/schema';

// —— mock 云层，只测同步引擎编排逻辑 ——
const mocks = vi.hoisted(() => ({
  initCloud: vi.fn(),
  disposeCloud: vi.fn(),
  cloudAdd: vi.fn(),
  cloudGet: vi.fn(),
  cloudUpdateByLocalId: vi.fn(),
  cloudRemoveByLocalId: vi.fn(),
  cloudFindByLocalId: vi.fn(),
  cloudWatch: vi.fn(),
}));

vi.mock('./cloud', () => ({
  COLLECTIONS: ['reactors', 'indicators', 'curves', 'cycles', 'measurements', 'influents', 'defaults', 'customRecords'],
  initCloud: mocks.initCloud,
  disposeCloud: mocks.disposeCloud,
  cloudAdd: mocks.cloudAdd,
  cloudGet: mocks.cloudGet,
  cloudUpdateByLocalId: mocks.cloudUpdateByLocalId,
  cloudRemoveByLocalId: mocks.cloudRemoveByLocalId,
  cloudFindByLocalId: mocks.cloudFindByLocalId,
  cloudWatch: mocks.cloudWatch,
}));

import {
  initSync,
  stopSync,
  syncNow,
  getSavedEnvId,
  saveEnvId,
  syncState,
  onSyncStateChange,
} from './sync';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

beforeEach(async () => {
  await clearAll();
  mocks.initCloud.mockReset();
  mocks.disposeCloud.mockReset();
  mocks.cloudAdd.mockReset();
  mocks.cloudGet.mockReset();
  mocks.cloudUpdateByLocalId.mockReset();
  mocks.cloudRemoveByLocalId.mockReset();
  mocks.cloudFindByLocalId.mockReset();
  mocks.cloudWatch.mockReset();
  mocks.initCloud.mockResolvedValue(undefined);
  mocks.cloudAdd.mockResolvedValue('mock-cloud-id');
  mocks.cloudGet.mockResolvedValue([]);
  mocks.cloudFindByLocalId.mockResolvedValue(null);
  mocks.cloudWatch.mockReturnValue(() => {});
  stopSync();
});

describe('环境 ID 存取', () => {
  it('保存后可读回', async () => {
    expect(await getSavedEnvId()).toBe('');
    await saveEnvId('my-env-123');
    expect(await getSavedEnvId()).toBe('my-env-123');
  });
});

describe('待同步队列', () => {
  it('队列变化时 pendingOps 更新', async () => {
    mocks.initCloud.mockResolvedValue(undefined);
    await initSync('env-1', 'test-key'); // 先启动，注册本地 hooks
    mocks.cloudAdd.mockRejectedValue(new Error('offline')); // 之后的新增推送失败 → 入队
    await db.reactors.add({ code: 'R1', name: '一号罐', note: '', active: true, sortOrder: 0, createdAt: '2026-08-31' });
    // creating hook 是 setTimeout 延后的，等一拍
    await new Promise((r) => setTimeout(r, 50));
    expect(syncState.pendingOps).toBeGreaterThan(0);
    const s = await db.settings.get('syncQueue');
    expect(s?.value).toBeTruthy();
    stopSync();
  });
});

describe('reconcile 双向对账', () => {
  it('云端独有 → 拉回本地', async () => {
    mocks.cloudGet.mockImplementation(async (col: string) => {
      if (col === 'reactors') {
        return [{ localId: 1, code: 'R1', name: '云端罐', note: '', active: true, sortOrder: 0, createdAt: '2026-08-31', _id: 'cid-1' }];
      }
      return [];
    });
    mocks.initCloud.mockResolvedValue(undefined);
    await initSync('env-1', 'test-key');
    const rows = await db.reactors.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
    expect(rows[0].name).toBe('云端罐');
    expect(syncState.status).toBe('connected');
    stopSync();
  });

  it('本地独有 → 推上云端（带 localId）', async () => {
    const localId = await db.reactors.add({ code: 'R1', name: '本地罐', note: '', active: true, sortOrder: 0, createdAt: '2026-08-31' });
    mocks.initCloud.mockResolvedValue(undefined);
    await initSync('env-1', 'test-key');
    expect(mocks.cloudAdd).toHaveBeenCalled();
    const [col, payload] = mocks.cloudAdd.mock.calls[0];
    expect(col).toBe('reactors');
    expect(payload.localId).toBe(localId);
    expect(payload.name).toBe('本地罐');
    stopSync();
  });

  it('两端都有且一致 → 不做写回', async () => {
    await db.reactors.add({ id: 1, code: 'R1', name: '一致罐', note: '', active: true, sortOrder: 0, createdAt: '2026-08-31' });
    mocks.cloudGet.mockImplementation(async (col: string) => {
      if (col === 'reactors') {
        return [{ localId: 1, code: 'R1', name: '一致罐', note: '', active: true, sortOrder: 0, createdAt: '2026-08-31', _id: 'cid-1' }];
      }
      return [];
    });
    mocks.initCloud.mockResolvedValue(undefined);
    await initSync('env-1', 'test-key');
    const rows = await db.reactors.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('一致罐');
    stopSync();
  });

  it('两端都有但不同 → 云端为准覆盖本地', async () => {
    await db.reactors.add({ id: 1, code: 'R1', name: '本地旧名', note: '', active: true, sortOrder: 0, createdAt: '2026-08-31' });
    mocks.cloudGet.mockImplementation(async (col: string) => {
      if (col === 'reactors') {
        return [{ localId: 1, code: 'R1', name: '云端新名', note: '', active: true, sortOrder: 0, createdAt: '2026-08-31', _id: 'cid-1' }];
      }
      return [];
    });
    mocks.initCloud.mockResolvedValue(undefined);
    await initSync('env-1', 'test-key');
    const rows = await db.reactors.toArray();
    expect(rows[0].name).toBe('云端新名');
    stopSync();
  });
});

describe('离线队列重放', () => {
  it('initSync 时先重放队列再对账', async () => {
    // 预置一条"删除"队列（模拟离线时删了 R1）
    await db.settings.put({
      key: 'syncQueue',
      value: [{ collection: 'reactors', op: 'delete', localId: 9 }],
    });
    mocks.initCloud.mockResolvedValue(undefined);
    await initSync('env-1', 'test-key');
    expect(mocks.cloudRemoveByLocalId).toHaveBeenCalledWith('reactors', 9);
    const s = await db.settings.get('syncQueue');
    expect((s?.value as any[]).length).toBe(0); // 成功重放后清空
    stopSync();
  });
});

describe('syncNow 手动同步', () => {
  it('同步后更新 lastSyncAt', async () => {
    mocks.initCloud.mockResolvedValue(undefined);
    await initSync('env-1', 'test-key');
    const before = syncState.lastSyncAt;
    await syncNow();
    expect(syncState.lastSyncAt).toBeGreaterThanOrEqual(before ?? 0);
    stopSync();
  });
});

describe('状态通知', () => {
  it('initSync 后 listeners 收到 connected', async () => {
    const seen: string[] = [];
    const off = onSyncStateChange((s) => seen.push(s.status));
    mocks.initCloud.mockResolvedValue(undefined);
    await initSync('env-1', 'test-key');
    expect(seen).toContain('connecting');
    expect(seen).toContain('connected');
    off();
    stopSync();
  });
});
