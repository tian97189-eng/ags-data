/**
 * 软件更新检查（APK / 网页版通用）
 *
 * 机制：云端（或任意静态托管）放一个 version.json：
 *   {
 *     "version": "1.2.0",
 *     "apkUrl": "https://.../AGS-data-app-1.2.0.apk",
 *     "notes": "修复了……",
 *     "publishedAt": "2026-08-31"
 *   }
 * App 启动时（或手动）请求该地址，与本地版本号对比，有新版本就提示。
 * 网页版（电脑端）不受此限制——改完代码重新构建部署，刷新即是新版。
 */

declare const __APP_VERSION__: string;

export interface UpdateInfo {
  version: string;
  apkUrl?: string;
  notes?: string;
  publishedAt?: string;
}

/** 当前应用版本号（构建时从 package.json 注入） */
export function getAppVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '0.0.0';
}

/** 比较两个版本号，a > b 返回 1，a < b 返回 -1，相等返回 0 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/**
 * 从更新检查地址拉取最新版本信息。
 * @returns 有新版返回 UpdateInfo，已是最新返回 null
 */
export async function checkUpdate(url: string): Promise<UpdateInfo | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`检查失败（HTTP ${res.status}）`);
  const info = (await res.json()) as UpdateInfo;
  if (!info.version) throw new Error('version.json 格式不正确（缺少 version 字段）');
  return compareVersions(info.version, getAppVersion()) > 0 ? info : null;
}

const LAST_CHECK_KEY = 'ags-last-update-check';

/** 距上次自动检查是否已超过 minMinutes（默认 24 小时） */
export function shouldAutoCheck(minMinutes = 24 * 60): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
    if (Date.now() - last < minMinutes * 60 * 1000) return false;
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}
