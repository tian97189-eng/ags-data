import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { removalRate } from '../../lib/stats';
import { outOfRange } from '../../lib/stats';
import { today } from '../../lib/format';
import { getDayNote, setDayNote } from '../../lib/dayNotes';
import { useAppStore } from '../../store/useAppStore';

/**
 * 单日小结：选定某天 → 所有罐 × 指标 的 进水/出水/去除率/状态 一屏总览，
 * 顶部可写「今日备注」（存 settings，自动进备份）。每天收工扫一眼核对数据。
 */
export default function DaySummary({ onClose }: { onClose: () => void }) {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);
  // 原因标注编辑：key = `${indId}:${code}` → 该行在编辑
  const [reasonKey, setReasonKey] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');

  const measurements = useLiveQuery(() => db.measurements.toArray(), []);
  const influents = useLiveQuery(() => db.influents.toArray(), []);
  const reactors = useLiveQuery(async () => {
    const all = await db.reactors.toArray();
    return all.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);
  const indicators = useLiveQuery(
    async () => {
      const all = await db.indicators.toArray();
      return all.filter((i) => i.active && i.category !== 'extras').sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [],
  );

  // 加载当天备注
  useEffect(() => {
    let dead = false;
    void getDayNote(date).then((n) => {
      if (!dead) {
        setNote(n);
        setNoteDirty(false);
      }
    });
    return () => {
      dead = true;
    };
  }, [date]);

  async function saveNote() {
    await setDayNote(date, note);
    setNoteDirty(false);
    toast(note.trim() ? '备注已保存' : '备注已清除', 'success');
  }

  // 当日各罐×指标的进出水聚合
  const rows = useMemo(() => {
    if (!measurements || !influents || !reactors || !indicators) return null;
    const outMap = new Map<string, Measurement>();
    for (const m of measurements) {
      if (m.scene === 'daily' && m.date === date && m.value != null) {
        outMap.set(`${m.reactorId}|${m.indicatorId}`, m); // 同组多条取最后
      }
    }
    const infOf = (indicatorId: number, reactorId: number | null) => {
      const own = influents.filter(
        (i) => i.date === date && i.indicatorId === indicatorId && i.reactorId === reactorId && i.value != null,
      );
      if (own.length > 0) return own.reduce((s, x) => s + (x.value ?? 0), 0) / own.length;
      const shared = influents.filter(
        (i) => i.date === date && i.indicatorId === indicatorId && i.reactorId == null && i.value != null,
      );
      if (shared.length > 0) return shared.reduce((s, x) => s + (x.value ?? 0), 0) / shared.length;
      return null;
    };

    const list: {
      indId: number;
      indName: string;
      unit: string;
      refLow: number | null;
      refHigh: number | null;
      rows: {
        code: string;
        inV: number | null;
        outV: number | null;
        rate: number | null;
        abnormal: boolean;
        mId?: number;
        reason: string;
      }[];
    }[] = [];

    for (const ind of indicators) {
      const per = reactors
        .map((r) => {
          const m = outMap.get(`${r.id!}|${ind.id!}`) ?? null;
          const outV = m?.value ?? null;
          const inV = infOf(ind.id!, r.id!);
          const rate = removalRate(inV, outV);
          const abnormal = outV != null && outOfRange(outV, ind.refLow, ind.refHigh);
          return {
            code: r.code,
            inV,
            outV,
            rate,
            abnormal,
            mId: m?.id,
            reason: m?.note ?? '',
          };
        })
        .filter((x) => x.inV != null || x.outV != null);
      if (per.length === 0) continue;
      list.push({
        indId: ind.id!,
        indName: ind.name,
        unit: ind.unit ?? '',
        refLow: ind.refLow,
        refHigh: ind.refHigh,
        rows: per,
      });
    }
    return list;
  }, [measurements, influents, reactors, indicators, date]);

  /** 打开原因标注编辑 */
  function startReason(indId: number, code: string, current: string) {
    setReasonKey(`${indId}:${code}`);
    setReasonDraft(current);
  }

  /** 保存原因到该条测量 note */
  async function saveReason() {
    if (reasonKey == null) return;
    const [indIdStr, code] = reasonKey.split(':');
    const g = rows?.find((x) => x.indId === Number(indIdStr));
    const rr = g?.rows.find((x) => x.code === code);
    if (!rr || rr.mId == null) return;
    await db.measurements.update(rr.mId, { note: reasonDraft.trim() });
    setReasonKey(null);
    toast(reasonDraft.trim() ? '已记录异常原因（会出现在周报里）' : '原因已清除', 'success');
  }

  const summary = useMemo(() => {
    if (!rows) return null;
    let samples = 0;
    let abnormal = 0;
    for (const g of rows) {
      for (const r of g.rows) {
        if (r.outV != null) samples++;
        if (r.abnormal) abnormal++;
      }
    }
    return { samples, abnormal };
  }, [rows]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-wrap">
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
          aria-label="返回查询"
        >
          ←
        </button>
        <div className="text-base font-medium">单日小结</div>
        <label className="flex items-center gap-1 text-xs ml-2">
          <span className="text-slate-500 dark:text-slate-400">日期</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-900"
          />
        </label>
        {summary && (
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            出水 {summary.samples} 个值
            {summary.abnormal > 0 && <span className="text-red-600 font-medium"> · {summary.abnormal} 个超范围</span>}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20">
        {/* 今日备注 */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-3 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
              今日备注（跟随日期保存，可进备份）
            </span>
            {noteDirty && (
              <button
                type="button"
                onClick={() => void saveNote()}
                className="px-2.5 py-1 rounded bg-teal-600 text-white text-xs"
              >
                保存备注
              </button>
            )}
          </div>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteDirty(true);
            }}
            placeholder="如：R2 曝气故障 / 下午加高氯酸盐 / 换水 50%…"
            className="w-full min-h-[44px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1.5 text-sm resize-y"
          />
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            备注会出现在「生成周报」里，方便回溯数据波动原因
          </div>
        </div>

        {rows == null ? (
          <div className="text-xs text-slate-400 p-6 text-center">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-10 text-sm">
            {date} 还没有任何进水/出水数据，先去「数据录入」填吧
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((g) => (
              <div
                key={g.indId}
                className="bg-white dark:bg-slate-800 rounded-lg shadow-card overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-medium">{g.indName}</span>
                  {g.unit && <span className="text-[11px] text-slate-400">({g.unit})</span>}
                  {(g.refLow != null || g.refHigh != null) && (
                    <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                      参考 {g.refLow ?? '—'} ~ {g.refHigh ?? '—'}
                    </span>
                  )}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 dark:text-slate-500">
                      <th className="text-left py-1.5 px-3 w-14 font-normal">罐</th>
                      <th className="text-right py-1.5 px-2 font-normal">进水</th>
                      <th className="text-right py-1.5 px-2 font-normal">出水</th>
                      <th className="text-right py-1.5 px-2 font-normal">去除率</th>
                      <th className="text-right py-1.5 px-3 font-normal w-14">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const editing = reasonKey === `${g.indId}:${r.code}`;
                      return (
                        <Fragment key={r.code}>
                          <tr>
                            <td className="py-1.5 px-3 border-t border-slate-50 dark:border-slate-800">
                              {r.code}
                            </td>
                            <td className="py-1.5 px-2 border-t border-slate-50 dark:border-slate-800 text-right tabular-nums">
                              {r.inV == null ? '—' : r.inV.toFixed(2)}
                            </td>
                            <td
                              className={`py-1.5 px-2 border-t border-slate-50 dark:border-slate-800 text-right font-medium tabular-nums ${
                                r.abnormal ? 'text-red-600 dark:text-red-400' : ''
                              }`}
                            >
                              {r.outV == null ? '—' : r.outV.toFixed(2)}
                            </td>
                            <td
                              className={`py-1.5 px-2 border-t border-slate-50 dark:border-slate-800 text-right tabular-nums ${
                                r.rate == null ? 'text-slate-300 dark:text-slate-600' : ''
                              }`}
                            >
                              {r.rate == null ? '—' : `${r.rate.toFixed(1)}%`}
                            </td>
                            <td className="py-1.5 px-3 border-t border-slate-50 dark:border-slate-800 text-right whitespace-nowrap">
                              {r.outV == null ? (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              ) : r.abnormal ? (
                                <button
                                  type="button"
                                  onClick={() => startReason(g.indId, r.code, r.reason)}
                                  className="text-red-600 dark:text-red-400 font-medium hover:underline"
                                  title={r.reason ? `原因：${r.reason}` : '给这个超范围值标注原因（会进周报）'}
                                >
                                  超范围{r.reason ? ' · 已注' : ''}
                                </button>
                              ) : (
                                <span className="text-teal-700 dark:text-teal-300">正常</span>
                              )}
                            </td>
                          </tr>
                          {editing && (
                            <tr>
                              <td colSpan={5} className="px-3 py-1.5 border-t border-slate-50 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-500/5">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="text-red-600 dark:text-red-400 shrink-0">
                                    {r.code} {g.indName} 超范围原因：
                                  </span>
                                  <input
                                    type="text"
                                    value={reasonDraft}
                                    aria-label="异常原因"
                                    placeholder="如：取样污染 / 曝气故障 / 试剂问题…"
                                    maxLength={120}
                                    className="flex-1 min-w-0 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-900"
                                    onChange={(e) => setReasonDraft(e.target.value)}
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void saveReason()}
                                    className="px-2.5 py-1 rounded bg-teal-600 text-white shrink-0"
                                  >
                                    保存
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReasonKey(null)}
                                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 shrink-0"
                                  >
                                    取消
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
