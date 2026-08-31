/**
 * 取样提醒模块
 * - buildReminderTimes：给定开始时间/间隔/次数，生成提醒时刻列表（纯函数，可测）
 * - notifySample：发出一条提醒（系统通知 + 提示音），浏览器/APK WebView 通用
 */

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

/** 发送一条"取样"系统通知；未授权时返回 false（调用方可回退到页面提示） */
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

/** 请求通知权限（返回是否已授权） */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
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
