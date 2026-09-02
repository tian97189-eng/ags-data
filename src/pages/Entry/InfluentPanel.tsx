import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalibrationCurve, type Indicator, type InfluentMode } from '../../db/schema';
import { computeConcentration } from '../../lib/calibration';
import { getInfluents, saveInfluent } from '../../lib/entry';
import { formatNumber } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';

export interface InfluentPanelHandle {
  save: () => Promise<void>;
  /** 从草稿快照恢复输入（不清 DB） */
  restoreDraft: (s: InfluentSnapshot) => void;
}

interface InfluentState {
  dilution: Record<number, string>;
  samples: Record<string, string>;
}

export interface InfluentSnapshot {
  dilution: Record<number, string>;
  samples: Record<string, string>;
}

/**
 * 进水录入面板：三氮一磷按吸光度经标曲换算，COD 直读浓度。
 * 空白吸光度与出水共用（由父组件传入出水卡片的实时空白值），只需在出水卡片填一次空白。
 * shared 模式每指标一套检测样；perReactor 模式每罐一套检测样。
 */
const InfluentPanel = forwardRef<
  InfluentPanelHandle,
  {
    date: string;
    blankByIndicator: Record<number, string>;
    /** 每次内部输入变化时回调快照（供父组件存草稿） */
    onStateChange?: (s: InfluentSnapshot) => void;
  }
>(function InfluentPanel({ date, blankByIndicator, onStateChange }, ref) {
  const toast = useAppStore((s) => s.toast);
  const indicators = useLiveQuery(
    async () => {
      const all = await db.indicators.toArray();
      return all.filter((i) => i.active).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [],
  );
  const reactors = useLiveQuery(
    async () => {
      const all = await db.reactors.toArray();
      return all.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [],
  );
  const curves = useLiveQuery(() => db.curves.toArray(), []);

  const [mode, setMode] = useState<InfluentMode>('shared');
  const [state, setState] = useState<InfluentState>({ dilution: {}, samples: {} });
  const [hydrated, setHydrated] = useState(false);

  // 数据加载完成后标记 hydrated，再对外回调快照
  useEffect(() => {
    if (!hydrated) return;
    onStateChange?.({ dilution: state.dilution, samples: state.samples });
  }, [state, hydrated, onStateChange]);

  // mode 初始化独立于数据加载：只在挂载时读一次 settings，避免数据加载的慢异步
  // 覆盖用户刚点击的「每罐各自」（竞态 bug：mode 曾绑在 [date, indicators] effect 里，
  // 该 effect 还会 await getInfluents，导致 indicators 加载后 mode 被重置回 shared）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await db.settings.get('influentMode');
      if (!cancelled) setMode((m?.value as InfluentMode) ?? 'shared');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const curvesByIndicator = useMemo(() => {
    const map: Record<number, CalibrationCurve | null> = {};
    for (const ind of indicators ?? []) {
      const list = (curves ?? [])
        .filter((c) => c.indicatorId === ind.id && c.effectiveTo === null)
        .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
      map[ind.id!] = list[0] ?? null;
    }
    return map;
  }, [indicators, curves]);

  useEffect(() => {
    if (!indicators) return;
    let cancelled = false;
    (async () => {
      const list = await getInfluents(date);
      const dilution: Record<number, string> = {};
      const samples: Record<string, string> = {};
      for (const ind of indicators) {
        const indRows = list.filter((i) => i.indicatorId === ind.id);
        if (indRows.length > 0) {
          dilution[ind.id!] = indRows[0].dilution != null ? String(indRows[0].dilution) : '';
        }
        for (const i of indRows) {
          const key = i.reactorId != null ? `${ind.id}:${i.reactorId}` : `${ind.id}:shared`;
          samples[key] = i.sampleAbs != null ? String(i.sampleAbs) : String(i.value ?? '');
        }
      }
      const m = await db.settings.get('influentMode');
      if (cancelled) return;
      setState({ dilution, samples });
      setMode((m?.value as InfluentMode) ?? 'shared');
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [date, indicators]);

  function computedValue(indicatorId: number, sample: string) {
    const ind = (indicators ?? []).find((i) => i.id === indicatorId);
    if (!ind) return null;
    if (ind.method === 'direct') {
      return sample === '' ? null : Number(sample);
    }
    const blank = blankByIndicator[indicatorId] ?? '';
    const dilution = state.dilution[indicatorId] ?? '';
    return computeConcentration({
      sampleAbs: sample === '' ? null : Number(sample),
      blankAbs: blank === '' ? null : Number(blank),
      dilution: dilution === '' ? null : Number(dilution),
      curve: curvesByIndicator[indicatorId] ?? null,
      lod: ind.lod,
    }).value;
  }

  /** composite（如总氮）：由 compositeRefs 对应指标的进水浓度求和（任一缺失则整行为空） */
  function compositeValue(ind: Indicator, keyOf: (refId: number) => string): number | null {
    const refs = ind.compositeRefs ?? [];
    if (refs.length === 0) return null;
    let sum = 0;
    for (const refId of refs) {
      const v = computedValue(refId, state.samples[keyOf(refId)] ?? '');
      if (v == null) return null;
      sum += v;
    }
    return sum;
  }

  /** composite 指标进水浓度：shared 用共用检测样；perReactor 用该罐检测样 */
  function compositeForReactor(ind: Indicator, reactorId: number | null): number | null {
    return compositeValue(ind, (refId) =>
      reactorId != null ? `${refId}:${reactorId}` : `${refId}:shared`,
    );
  }

  function setDilution(indicatorId: number, v: string) {
    setState((p) => ({ ...p, dilution: { ...p.dilution, [indicatorId]: v } }));
  }
  function setSample(key: string, v: string) {
    setState((p) => ({ ...p, samples: { ...p.samples, [key]: v } }));
  }

  async function save() {
    if (!indicators) return;
    for (const ind of indicators) {
      // 清理该指标当日的旧记录，避免切换模式残留
      await db.influents
        .where('date')
        .equals(date)
        .filter((i) => i.indicatorId === ind.id)
        .delete();

      // composite（总氮）不走吸光度：浓度 = 三氮进水之和，直接写 value
      if (ind.compositeType != null) {
        if (mode === 'shared') {
          const v = compositeForReactor(ind, null);
          if (v != null) {
            await db.influents.add({
              date, mode: 'shared', reactorId: null, indicatorId: ind.id!,
              inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null,
              value: v, curveId: null,
            });
          }
        } else {
          for (const r of reactors ?? []) {
            const v = compositeForReactor(ind, r.id!);
            if (v != null) {
              await db.influents.add({
                date, mode: 'perReactor', reactorId: r.id!, indicatorId: ind.id!,
                inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null,
                value: v, curveId: null,
              });
            }
          }
        }
        continue;
      }

      const blank = blankByIndicator[ind.id!] ?? '';
      const dilution = state.dilution[ind.id!] ?? '';
      const blankAbs = blank === '' ? null : Number(blank);
      const dilutionVal = dilution === '' ? null : Number(dilution);

      if (mode === 'shared') {
        const sample = state.samples[`${ind.id}:shared`] ?? '';
        await saveInfluent({
          date, mode: 'shared', reactorId: null, indicatorId: ind.id!,
          sampleAbs: sample === '' ? null : Number(sample),
          blankAbs,
          dilution: dilutionVal,
        });
      } else {
        for (const r of reactors ?? []) {
          const sample = state.samples[`${ind.id}:${r.id}`] ?? '';
          await saveInfluent({
            date, mode: 'perReactor', reactorId: r.id!, indicatorId: ind.id!,
            sampleAbs: sample === '' ? null : Number(sample),
            blankAbs,
            dilution: dilutionVal,
          });
        }
      }
    }
    toast('进水已保存', 'success');
  }

  useImperativeHandle(
    ref,
    () => ({
      save,
      restoreDraft: (s: InfluentSnapshot) => {
        setState({ dilution: s.dilution ?? {}, samples: s.samples ?? {} });
        setHydrated(true);
      },
    }),
    [save],
  );

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg mb-4 p-3 text-xs">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="text-slate-500 dark:text-slate-400">进水浓度（吸光度自动换算）</span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">空白吸光度与出水共用</span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setMode('shared')}
            className={`px-2.5 py-1 rounded-md border ${
              mode === 'shared'
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            几罐共用
          </button>
          <button
            type="button"
            onClick={() => setMode('perReactor')}
            className={`px-2.5 py-1 rounded-md border ${
              mode === 'perReactor'
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            每罐各自
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-3 px-3">
        <table className="w-full table-fixed border-collapse text-xs min-w-[640px]">
          <thead>
            <tr className="text-slate-500 dark:text-slate-400">
              <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">指标</th>
              <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">
                空白（同出水）
              </th>
              <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">稀释</th>
              {mode === 'shared' ? (
                <>
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                    检测样
                  </th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20 whitespace-nowrap">
                    浓度 mg/L
                  </th>
                </>
              ) : (
                (reactors ?? []).map((r) => (
                  <th
                    key={r.id}
                    className="text-center py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap"
                    title={`${r.code} 检测样 → 浓度`}
                  >
                    {r.code}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {indicators?.map((ind) => {
              const isDirect = ind.method === 'direct';
              const isComposite = ind.compositeType != null;
              const dilution = state.dilution[ind.id!] ?? '';
              return (
                <tr key={ind.id}>
                  <td className="py-1.5 px-2 border-b border-slate-50">
                    {ind.name}
                    {isDirect && <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">直读</span>}
                    {isComposite && (
                      <span className="ml-1 text-[10px] text-teal-500">自动求和</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 border-b border-slate-50 text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    {isDirect || isComposite ? '—' : blankByIndicator[ind.id!] || '—'}
                  </td>
                  <td className="py-1.5 px-2 border-b border-slate-50">
                    {isDirect || isComposite ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <input
                        type="number"
                        step="any"
                        aria-label={`${ind.name} 进水稀释`}
                        className="w-full min-w-[3.5rem] border border-slate-200 dark:border-slate-700 rounded px-2 py-1"
                        value={dilution}
                        onChange={(e) => setDilution(ind.id!, e.target.value)}
                      />
                    )}
                  </td>
                  {mode === 'shared' ? (
                    isComposite ? (
                      <>
                        <td className="py-1.5 px-2 border-b border-slate-50 text-slate-400 dark:text-slate-500">
                          自动 = 氨氮 + 亚硝 + 硝态
                        </td>
                        <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700 whitespace-nowrap">
                          {formatNumber(compositeForReactor(ind, null))}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 px-2 border-b border-slate-50">
                          <input
                            type="number"
                            step="any"
                            aria-label={`${ind.name} 进水检测样`}
                            className="w-full min-w-[3.5rem] border border-slate-200 dark:border-slate-700 rounded px-2 py-1"
                            value={state.samples[`${ind.id}:shared`] ?? ''}
                            onChange={(e) => setSample(`${ind.id}:shared`, e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700 whitespace-nowrap">
                          {formatNumber(computedValue(ind.id!, state.samples[`${ind.id}:shared`] ?? ''))}
                        </td>
                      </>
                    )
                  ) : (
                    (reactors ?? []).map((r) =>
                      isComposite ? (
                        <td key={r.id} className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700 whitespace-nowrap">
                          {formatNumber(compositeForReactor(ind, r.id!))}
                        </td>
                      ) : (
                        <td key={r.id} className="py-1.5 px-2 border-b border-slate-50">
                          <input
                            type="number"
                            step="any"
                            aria-label={`${ind.name} ${r.code} 进水检测样`}
                            className="w-full min-w-[3.5rem] border border-slate-200 dark:border-slate-700 rounded px-2 py-1"
                            value={state.samples[`${ind.id}:${r.id}`] ?? ''}
                            onChange={(e) => setSample(`${ind.id}:${r.id}`, e.target.value)}
                          />
                          <span className="block text-right text-teal-700 whitespace-nowrap">
                            {formatNumber(computedValue(ind.id!, state.samples[`${ind.id}:${r.id}`] ?? ''))}
                          </span>
                        </td>
                      ),
                    )
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default InfluentPanel;
