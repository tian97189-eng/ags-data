import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { db } from '../../db/schema';

const mocks = vi.hoisted(() => ({
  initSync: vi.fn(),
  stopSync: vi.fn(),
  syncNow: vi.fn(),
  getSavedEnvId: vi.fn(),
  saveEnvId: vi.fn(),
  getSavedAccessKey: vi.fn(),
  saveAccessKey: vi.fn(),
  isSyncing: vi.fn(() => false),
  onSyncStateChange: vi.fn(() => () => {}),
  syncState: { status: 'idle' as string, lastSyncAt: null, lastError: '', pendingOps: 0, envId: '' },
}));

vi.mock('../../lib/sync', () => ({
  initSync: mocks.initSync,
  stopSync: mocks.stopSync,
  syncNow: mocks.syncNow,
  getSavedEnvId: mocks.getSavedEnvId,
  saveEnvId: mocks.saveEnvId,
  getSavedAccessKey: mocks.getSavedAccessKey,
  saveAccessKey: mocks.saveAccessKey,
  isSyncing: mocks.isSyncing,
  onSyncStateChange: mocks.onSyncStateChange,
  syncState: mocks.syncState,
}));

import CloudSyncSettings from './CloudSyncSettings';

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  mocks.initSync.mockReset();
  mocks.stopSync.mockReset();
  mocks.syncNow.mockReset();
  mocks.getSavedEnvId.mockReset();
  mocks.saveEnvId.mockReset();
  mocks.getSavedAccessKey.mockReset();
  mocks.saveAccessKey.mockReset();
  mocks.getSavedEnvId.mockResolvedValue('');
  mocks.saveEnvId.mockResolvedValue(undefined);
  mocks.getSavedAccessKey.mockResolvedValue('');
  mocks.saveAccessKey.mockResolvedValue(undefined);
  mocks.initSync.mockResolvedValue(undefined);
  mocks.syncNow.mockResolvedValue(undefined);
  mocks.syncState.status = 'idle';
  mocks.syncState.lastSyncAt = null;
  mocks.syncState.lastError = '';
  mocks.syncState.pendingOps = 0;
});

describe('CloudSyncSettings 云同步面板', () => {
  it('未配置时显示未启用状态和启用按钮', async () => {
    render(<CloudSyncSettings />);
    expect(await screen.findByText('未启用')).toBeTruthy();
    expect(screen.getByText('启用云同步')).toBeTruthy();
  });

  it('填入环境 ID 与 API 密钥点启用 → 保存并连接', async () => {
    render(<CloudSyncSettings />);
    const envInput = await screen.findByPlaceholderText(/ags-/);
    await userEvent.type(envInput, 'my-env-123');
    const keyInput = await screen.findByPlaceholderText(/pk-/);
    await userEvent.type(keyInput, 'pk-test-key');
    await userEvent.click(screen.getByText('启用云同步'));
    await waitFor(() => {
      expect(mocks.saveEnvId).toHaveBeenCalledWith('my-env-123');
      expect(mocks.saveAccessKey).toHaveBeenCalledWith('pk-test-key');
      expect(mocks.initSync).toHaveBeenCalledWith('my-env-123', 'pk-test-key');
    });
  });

  it('未填 API 密钥点启用会提示', async () => {
    render(<CloudSyncSettings />);
    const envInput = await screen.findByPlaceholderText(/ags-/);
    await userEvent.type(envInput, 'my-env-123');
    // 不填 API 密钥
    await userEvent.click(screen.getByText('启用云同步'));
    // initSync 不应被调用
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.initSync).not.toHaveBeenCalled();
  });

  it('已连接时显示立即同步与停用按钮', async () => {
    mocks.getSavedEnvId.mockResolvedValue('env-x');
    mocks.syncState.status = 'connected';
    mocks.syncState.lastSyncAt = Date.now();
    mocks.isSyncing.mockReturnValue(true);
    // 模拟组件订阅后拿到 connected 状态
    mocks.onSyncStateChange.mockImplementation((fn: (s: any) => void) => {
      fn({ ...mocks.syncState });
      return () => {};
    });
    render(<CloudSyncSettings />);
    expect(await screen.findByText(/已连接/)).toBeTruthy();
    expect(screen.getByText('立即同步')).toBeTruthy();
    expect(screen.getByText('停用云同步')).toBeTruthy();
    expect(screen.getByDisplayValue('env-x')).toBeTruthy();
  });
});
