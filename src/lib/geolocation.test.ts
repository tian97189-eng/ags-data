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