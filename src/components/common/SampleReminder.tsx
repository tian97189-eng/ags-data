import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { buildReminderTimes, msToNext, notifySample, playBeep } from '../../lib/reminder';

/**
 * 取样提醒面板：全周期实验时按间隔提醒取样（系统通知 + 提示音 + 页面提示）。
 * 兼容电脑浏览器与手机 APK WebView（Notification API）。
 */
export default function SampleReminder({
  defaultInterval = 30,
  defaultCount = 12,
}: {
  defaultInterval?: number;
  defaultCount?: number;
}) {
  const toast = useAppStore((s) => s.toast);
  const [running, setRunning] = useState(false);
  const [intervalMin, setIntervalMin] = useState(String(defaultInterval));
  const [count, setCount] = useState(String(defaultCount));
  const [next, setNext] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function stop() {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setRunning(false);
    setNext(null);
    setDone(0);
  }

  async function start() {
    const iv = Number(intervalMin);
    const ct = Number(count);
    if (!(iv > 0) || !(ct > 0)) {
      toast('请填写有效的间隔和次数', 'warning');
      return;
    }
    setDone(0);
    const times = buildReminderTimes(new Date(), iv, ct);
    const now = new Date();
    const fire = async (idx: number) => {
      setDone(idx);
      setNext(null);
      playBeep();
      const notified = await notifySample(idx);
      toast(
        notified
          ? `第 ${idx} 次取样时间到`
          : `第 ${idx} 次取样时间到（浏览器未授权通知，请看时间）`,
        'success',
      );
      scheduleNext(idx + 1);
    };
    const scheduleNext = (nextIdx: number) => {
      const ms = msToNext(times.slice(nextIdx - 1), new Date());
      if (ms == null) {
        setRunning(false);
        toast('全部取样提醒完成', 'info');
        return;
      }
      setNext(new Date(Date.now() + ms).toLocaleTimeString('zh-CN', { hour12: false }));
      timerRef.current = window.setTimeout(() => void fire(nextIdx), ms);
    };
    setRunning(true);
    // 立即提醒第一次，然后按间隔排程
    void fire(1);
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500">取样提醒</span>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">间隔</span>
          <input
            type="number"
            min={1}
            aria-label="取样提醒间隔"
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
            aria-label="取样提醒次数"
            className="w-14 border border-slate-200 rounded px-1.5 py-1"
            value={count}
            disabled={running}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
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
          {done > 0 && <span>已提醒 {done} 次 · </span>}
          {next ? <span>下次提醒 {next}</span> : <span>等待中…</span>}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-1.5">
        到点会响铃并弹系统通知；手机首次使用请允许通知权限。建议先用"开始提醒"试试提示音。
      </p>
    </div>
  );
}
