import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  buildReminderTimes,
  cancelSampleReminders,
  ensureNotificationPermission,
  isNativePlatform,
  msToNext,
  notifySample,
  playBeep,
  scheduleSampleReminders,
  type ReminderTime,
} from '../../lib/reminder';

/**
 * 通用提醒面板：可自定义标题与提醒时刻。
 * - 常规用法：传 defaultInterval/defaultCount，组件自己按间隔生成时刻（如"取样提醒"）
 * - 外部静态时刻：传 externalTimes（好氧段 DO 测值等，提前算好的绝对时刻）
 * - 运行时生成时刻：传 buildExternalTimes 回调（点「开始」那一刻才生成，如 EPS PN 加药
 *   计时规划——时刻基于"现在"起算，且带具体动作文案 text）
 *
 * 原生 App（APK）：用 LocalNotifications 提前排程，到点系统响铃 + 弹通知；
 * 浏览器：setTimeout + Web Notification + 蜂鸣音。
 */
export default function SampleReminder({
  label = '取样提醒',
  defaultInterval = 30,
  defaultCount = 12,
  externalTimes,
  buildExternalTimes,
  externalHint,
}: {
  label?: string;
  defaultInterval?: number;
  defaultCount?: number;
  externalTimes?: ReminderTime[];
  buildExternalTimes?: () => ReminderTime[];
  externalHint?: string;
}) {
  const toast = useAppStore((s) => s.toast);
  const [running, setRunning] = useState(false);
  const [intervalMin, setIntervalMin] = useState(String(defaultInterval));
  const [count, setCount] = useState(String(defaultCount));
  const [next, setNext] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function stop() {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    void cancelSampleReminders();
    setRunning(false);
    setNext(null);
    setDone(0);
    setTotal(0);
  }

  async function start() {
    let times: ReminderTime[];
    if (buildExternalTimes) {
      times = buildExternalTimes();
      if (times.length === 0) {
        toast(`没有可用的「${label}」时刻`, 'warning');
        return;
      }
    } else if (externalTimes) {
      times = externalTimes;
      if (times.length === 0) {
        toast(`没有可用的「${label}」时刻（请先标记好氧段）`, 'warning');
        return;
      }
    } else {
      const iv = Number(intervalMin);
      const ct = Number(count);
      if (!(iv > 0) || !(ct > 0)) {
        toast('请填写有效的间隔和次数', 'warning');
        return;
      }
      times = buildReminderTimes(new Date(), iv, ct);
    }

    setDone(0);
    setTotal(times.length);
    setRunning(true);

    // 请求通知权限（原生弹系统授权；浏览器弹浏览器授权）
    await ensureNotificationPermission();
    // 原生：提前排程所有提醒（到点系统响铃）；浏览器返回 false
    const nativeScheduled = await scheduleSampleReminders(times, label);

    const fire = async (idx: number) => {
      const t = times[idx - 1];
      const msg = t?.text ?? `第 ${idx} 次${label}时间到`;
      setDone(idx);
      setNext(null);
      playBeep();
      if (nativeScheduled) {
        toast(msg, 'success');
      } else {
        const notified = t?.text
          ? await notifySample(idx, label, t.text)
          : await notifySample(idx, label);
        toast(
          notified ? msg : `${msg}（未授权通知，请看时间）`,
          'success',
        );
      }
      scheduleNext(idx + 1);
    };
    const scheduleNext = (nextIdx: number) => {
      const ms = msToNext(times.slice(nextIdx - 1), new Date());
      if (ms == null) {
        setRunning(false);
        toast(`${label}全部完成`, 'info');
        return;
      }
      setNext(new Date(Date.now() + ms).toLocaleTimeString('zh-CN', { hour12: false }));
      timerRef.current = window.setTimeout(() => void fire(nextIdx), ms);
    };
    // 立即提醒第一次，然后按间隔排程
    void fire(1);
  }

  const isExternal = !!(externalTimes || buildExternalTimes);

  return (
    <div className="border border-slate-200 rounded-lg p-3 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500">{label}</span>
        {!isExternal && (
          <>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">间隔</span>
              <input
                type="number"
                min={1}
                aria-label={`${label}间隔`}
                className="w-14 border border-slate-200 rounded px-1.5 py-1"
                value={intervalMin}
                disabled={running}
                onChange={(e) => setIntervalMin(e.target.value)}
              />
              <span className="text-slate-400">分</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">次数</span>
              <input
                type="number"
                min={1}
                aria-label={`${label}次数`}
                className="w-14 border border-slate-200 rounded px-1.5 py-1"
                value={count}
                disabled={running}
                onChange={(e) => setCount(e.target.value)}
              />
            </label>
          </>
        )}
        {isExternal && (
          <span className="text-slate-400">
            {externalHint ??
              (externalTimes ? `好氧段共 ${externalTimes.length} 个测点` : '按计时规划响铃')}
          </span>
        )}
        {!running ? (
          <button
            type="button"
            onClick={() => void start()}
            className="px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700"
          >
            开始提醒
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50"
          >
            停止
          </button>
        )}
      </div>
      {running && (
        <div className="mt-2 text-teal-700">
          {done > 0 && <span>已提醒 {done}/{total} 次 · </span>}
          {next ? <span>下次提醒 {next}</span> : <span>等待中…</span>}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-1.5">
        {isNativePlatform()
          ? '到点会响铃并弹系统通知（含锁屏）；请先在系统弹窗中允许通知权限。'
          : '到点会响铃并弹系统通知；手机首次使用请允许通知权限。'}
      </p>
    </div>
  );
}
