import { describe, it, expect, beforeEach, vi } from 'vitest';

async function clearGeo() {
  try {
    delete (navigator as { geolocation?: unknown }).geolocation;
  } catch {
    /* ignore */
  }
}

describe('getCurrentCoord（跨平台定位，APK 走 @capacitor/geolocation 插件）', () => {
  beforeEach(clearGeo);

  it('Web fallback：navigator.geolocation 成功 → 返回坐标', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: 28.23, longitude: 112.94 } }),
      },
    });
    const { getCurrentCoord } = await import('./geolocation');
    const r = await getCurrentCoord();
    expect(r).toEqual({ lat: 28.23, lon: 112.94 });
  });

  it('Web fallback：用户拒绝 → 返回 null', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (e: Error) => void) => fail(new Error('denied')),
      },
    });
    const { getCurrentCoord } = await import('./geolocation');
    const r = await getCurrentCoord();
    expect(r).toBeNull();
  });

  it('设备无 geolocation API → 返回 null（提示用户手动输入城市）', async () => {
    // 不 stub：navigator.geolocation 默认不存在
    const { getCurrentCoord } = await import('./geolocation');
    const r = await getCurrentCoord();
    expect(r).toBeNull();
  });

  it('requestLocationPermission：web 端静默返回 false（不弹窗）', async () => {
    const { requestLocationPermission } = await import('./geolocation');
    expect(await requestLocationPermission()).toBe(false);
  });

  it('requestLocationPermission：原生平台已授权 → 返回 true 不弹窗', async () => {
    vi.resetModules();
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/geolocation', () => ({
      Geolocation: {
        checkPermissions: async () => ({ location: 'granted' }),
        requestPermissions: async () => ({ location: 'granted' }),
      },
    }));
    const { requestLocationPermission } = await import('./geolocation');
    expect(await requestLocationPermission()).toBe(true);
    vi.doUnmock('@capacitor/core');
    vi.doUnmock('@capacitor/geolocation');
    vi.resetModules();
  });

  it('requestLocationPermission：原生平台未授权 → 调用 requestPermissions → 用户拒绝返 false', async () => {
    vi.resetModules();
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/geolocation', () => ({
      Geolocation: {
        checkPermissions: async () => ({ location: 'prompt' }),
        requestPermissions: async () => ({ location: 'denied' }),
      },
    }));
    const { requestLocationPermission } = await import('./geolocation');
    expect(await requestLocationPermission()).toBe(false);
    vi.doUnmock('@capacitor/core');
    vi.doUnmock('@capacitor/geolocation');
    vi.resetModules();
  });

  it('Web 模式：dynamic import @capacitor/core 失败时不抛错（jsdom 无 Capacitor global）', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: 1, longitude: 2 } }),
      },
    });
    // 不 mock @capacitor/core — 确保 tryCapacitor 内部 catch 不抛
    const { getCurrentCoord } = await import('./geolocation');
    const r = await getCurrentCoord();
    expect(r).toEqual({ lat: 1, lon: 2 });
  });
});