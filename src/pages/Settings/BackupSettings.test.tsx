import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../db/schema';
import BackupSettings from './BackupSettings';
import { useAppStore } from '../../store/useAppStore';

const mocks = vi.hoisted(() => ({
  saveAndShare: vi.fn(),
}));

vi.mock('../../lib/share', () => ({
  saveAndShare: mocks.saveAndShare,
}));

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('BackupSettings 下载模板', () => {
  beforeEach(async () => {
    await clearAll();
    mocks.saveAndShare.mockReset();
    mocks.saveAndShare.mockResolvedValue({ ok: true, method: 'web' });
  });

  it('点「下载模板」→ 走 saveAndShare（base64）而不是裸 XLSX.writeFile', async () => {
    render(<BackupSettings />);
    await screen.findByText('下载模板');
    fireEvent.click(screen.getByText('下载模板'));

    await waitFor(() => {
      expect(mocks.saveAndShare).toHaveBeenCalledTimes(1);
    });
    const [opts] = mocks.saveAndShare.mock.calls[0];
    expect(opts.filename).toBe('AGS数据导入模板.xlsx');
    expect(opts.encoding).toBe('base64');
    // content 是一段 base64（xlsx 魔数 PK 开头，base64 编码后为 UE…）
    expect(opts.content).toMatch(/^UEsDB/);
  });

  it('原生端返回 native 时提示保存到手机', async () => {
    mocks.saveAndShare.mockResolvedValue({ ok: true, method: 'native', uri: 'file:///doc' });
    render(<BackupSettings />);
    await screen.findByText('下载模板');
    fireEvent.click(screen.getByText('下载模板'));
    await waitFor(() => {
      const toasts = useAppStore.getState().toasts;
      expect(toasts.some((t) => t.text.includes('模板已保存到手机'))).toBe(true);
    });
  });
});
