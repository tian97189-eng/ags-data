/**
 * 获取当前位置（坐标），跨平台：
 * - APK (Capacitor native)：用 @capacitor/geolocation 插件，会自动申请 Android 运行时权限（ACCESS_COARSE/FINE_LOCATION）
 * - Web / PWA：fallback 用 navigator.geolocation（https 下浏览器弹授权对话框）
 *
 * 返回 null 表示用户拒绝 / 设备不支持 / 错误。调用方应提示"请手动输入城市"。
 */

/** 与 @capacitor/geolocation 的 PermissionStatus 等价（避免测试时引入插件） */
export interface CoordResult {
  lat: number;
  lon: number;
}

interface CapacitorShape {
  isNativePlatform?: () => boolean;
}
interface GeolocationPluginShape {
  checkPermissions: () => Promise<{ location: 'granted' | 'denied' | 'prompt' | 'unknown' }>;
  requestPermissions: () => Promise<{ location: 'granted' | 'denied' | 'prompt' | 'unknown' }>;
  getCurrentPosition: (opts: { enableHighAccuracy?: boolean; timeout?: number }) => Promise<{
    coords: { latitude: number; longitude: number };
  }>;
}

async function tryCapacitor(): Promise<CoordResult | null> {
  try {
    // 动态 import 避免 web 端无 Capacitor 时启动失败
    const cap = (await import('@capacitor/core')) as { Capacitor?: CapacitorShape };
    if (!cap.Capacitor?.isNativePlatform?.()) return null;
    const mod = (await import('@capacitor/geolocation')) as {
      Geolocation?: GeolocationPluginShape;
    };
    if (!mod.Geolocation) return null;
    const perm = await mod.Geolocation.checkPermissions();
    if (perm.location !== 'granted') {
      const req = await mod.Geolocation.requestPermissions();
      if (req.location !== 'granted') return null;
    }
    const pos = await mod.Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}

function tryWeb(): Promise<CoordResult | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });
}

export async function getCurrentCoord(): Promise<CoordResult | null> {
  // 原生优先（APK 自动申请权限），失败/不可用则 web fallback
  const fromNative = await tryCapacitor();
  if (fromNative) return fromNative;
  return tryWeb();
}