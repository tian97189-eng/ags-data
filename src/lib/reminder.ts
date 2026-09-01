/**
 * 取样提醒模块
 * - buildReminderTimes：给定开始时间/间隔/次数，生成提醒时刻列表（纯函数，可测）
 * - msToNext：距下一次提醒的毫秒数（纯函数，可测）
 * - playBeep：Web Audio 蜂鸣音（浏览器 fallback）
 * - ensureNotificationPermission / scheduleSampleReminders / cancelSampleReminders：
 *   原生 App（Capacitor）走 LocalNotifications（系统通知 + 声音 + 权限），
 *   浏览器走 Web Notification API。
 *
 * 手机 APK 里的 WebView 不实现标准浏览器 Notification API，导致之前只有页面提示、
 * 无声音、也申请不到权限。改用 @capacitor/local-notifications 原生通知后，
 * 有系统声音、能弹系统通知、能正确申请通知权限（Android 13+ POST_NOTIFICATIONS）。
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface ReminderTime {
  /** ISO 时间戳 */
  at: string;
  /** 第几次取样（1 起） */
  index: number;
}

/** 生成取样提醒时刻。start 为开始时刻（含），间隔 intervalMin 分钟，共 count 次 */
export function buildReminderTimes(
  start: Date,
  intervalMin: number,
  count: number,
): ReminderTime[] {
  const list: ReminderTime[] = [];
  if (!(intervalMin > 0) || !(count > 0)) return list;
  for (let i = 0; i < count; i++) {
    const t = new Date(start.getTime() + i * intervalMin * 60_000);
    list.push({ at: t.toISOString(), index: i + 1 });
  }
  return list;
}

/** 距下一次提醒的毫秒数；没有下一次返回 null */
export function msToNext(times: ReminderTime[], now: Date): number | null {
  const nowMs = now.getTime();
  for (const t of times) {
    const ms = new Date(t.at).getTime() - nowMs;
    if (ms >= 0) return ms;
  }
  return null;
}

/** 是否运行在原生 App（Capacitor APK）中 */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let audioCtx: AudioContext | null = null;

/** 播放一声提示音（Web Audio 生成，无需音频文件） */
export function playBeep(times = 2): void {
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    for (let k = 0; k < times; k++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const t0 = audioCtx.currentTime + k * 0.35;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    }
  } catch {
    /* 音频不可用则静默 */
  }
}

const CHANNEL_ID = 'ags-sampling';

/** 请求通知权限（原生走系统权限，Web 走浏览器权限）。返回是否已授权。 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (isNativePlatform()) {
      const r = await LocalNotifications.requestPermissions();
      return r.display === 'granted';
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      return p === 'granted';
    }
    return false;
  } catch {
    return false;
  }
}

/** 发送一条"取样"系统通知（Web 浏览器）。未授权时返回 false。 */
export async function notifySample(index: number, label = '取样提醒'): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return false;
    }
    if (Notification.permission !== 'granted') return false;
    const n = new Notification(label, {
      body: `第 ${index} 次取样时间到，请记录数据`,
      tag: `ags-sample-${index}`,
    });
    n.onclick = () => window.focus();
    return true;
  } catch {
    return false;
  }
}

/**
 * 原生 App：提前排程所有取样提醒（系统通知 + 默认声音，App 后台/锁屏也能响）。
 * 浏览器：返回 false（调用方走 setTimeout + notifySample + playBeep）。
 * @returns 是否已在原生端排程成功
 */
export async function scheduleSampleReminders(
  times: ReminderTime[],
  label = '取样提醒',
): Promise<boolean> {
  if (!isNativePlatform() || times.length === 0) return false;
  try {
    // Android 8+ 需要通知渠道；importance=5(HIGH) 会响铃 + 弹横幅
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: '取样提醒',
        description: '全周期取样与 DO 测值提醒',
        importance: 5,
        sound: 'default',
        vibration: true,
      });
    } catch {
      /* 渠道已存在则忽略 */
    }
    const baseId = Math.floor(Date.now() / 1000);
    const notifications = times.map((t) => ({
      id: baseId + t.index,
      title: label,
      body: `第 ${t.index} 次取样时间到，请记录数据`,
      schedule: { at: new Date(t.at), allowWhileIdle: true },
      sound: 'default',
      smallIcon: 'ic_launcher',
      channelId: CHANNEL_ID,
    }));
    await LocalNotifications.schedule({ notifications });
    return true;
  } catch {
    return false;
  }
}

/** 原生 App：取消所有取样提醒（停止时调用） */
export async function cancelSampleReminders(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await LocalNotifications.cancelAll();
  } catch {
    /* 忽略 */
  }
}
