import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { compareVersions, checkUpdate, getAppVersion, shouldAutoCheck } from './updater';

describe('compareVersions', () => {
  it('同版本返回 0', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
  it('新版本大于旧版本', () => {
    expect(compareVersions('1.1.0', '1.0.9')).toBe(1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
  });
  it('旧版本小于新版本', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
  });
});

describe('getAppVersion', () => {
  it('返回非空版本号', () => {
    expect(getAppVersion().length).toBeGreaterThan(0);
  });
});

describe('checkUpdate', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.clear();
  });

  it('云端有新版 → 返回更新信息', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ version: '99.0.0', apkUrl: 'https://x/a.apk', notes: '修复' }),
    });
    const info = await checkUpdate('https://x/version.json');
    expect(info).not.toBeNull();
    expect(info!.version).toBe('99.0.0');
    expect(info!.apkUrl).toBe('https://x/a.apk');
  });

  it('已是最高版本 → 返回 null', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ version: getAppVersion() }),
    });
    expect(await checkUpdate('https://x/version.json')).toBeNull();
  });

  it('HTTP 失败 → 抛错', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 404 });
    await expect(checkUpdate('https://x/version.json')).rejects.toThrow();
  });

  it('格式不对 → 抛错', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ apkUrl: 'x' }),
    });
    await expect(checkUpdate('https://x/version.json')).rejects.toThrow();
  });
});

describe('shouldAutoCheck', () => {
  beforeEach(() => localStorage.clear());
  it('首次调用返回 true', () => {
    expect(shouldAutoCheck(1)).toBe(true);
  });
  it('刚检查过（1 分钟内）返回 false', () => {
    shouldAutoCheck(1);
    expect(shouldAutoCheck(1)).toBe(false);
  });
});
