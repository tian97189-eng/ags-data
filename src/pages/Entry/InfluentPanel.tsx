import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalibrationCurve, type InfluentMode } from '../../db/schema';
import { computeConcentration } from '../../lib/calibration';
import { dailyScope, getInfluents, saveInfluent } from '../../lib/entry';
import { formatNumber } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';

export interface InfluentPanelHandle {
  save: () => Promise<void>;
}

interface InfluentState {
  dilution: Record<number, string>;
  samples: Record<string, string>;
}

/**
 * 进水录入面板：三氮一磷按吸光度经标曲换算，COD 直读浓度。
 * 空白吸光度与出水共用（读 defaults 表），只需在出水卡片填一次空白。
 * shared 模式每指标一套检测样；perReactor 模式每罐一套检测样。
 */
const InfluentPanel = forwardRef<InfluentPanelHandle, { date: string }>(function InfluentPanel(
  { date },
  ref,
) {
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

  // 出水空白（defaults 表），进水与出水共用同一空白
  const defaults = useLiveQuery(
    () => db.defaults.where('scopeKey').equals(dailyScope(date)).toArray(),
    [date],
  ) ?? [];

  const blankByIndicator = useMemo(() => {
    const map: Record<number, string> = {};
    for (const d of defaults) {
      map[d.indicatorId] = d.blankAbs != null ? String(d.blankAbs) : '';
    }
    return map;
  }, [defaults]);

  const [mode, setMode] = useState<InfluentMode>('shared');
  const [state, setState] = useState<InfluentState>({ dilution: {}, samples: {} });

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

  useImperativeHandle(ref, () => ({ save }), [save]);

  return (
    <div className="border border-slate-200 rounded-lg mb-4 p-3 text-xs">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="text-slate-500">进水浓度（吸光度自动换算）</span>
        <span className="text-[11px] text-slate-400">空白吸光度与出水共用</span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setMode('shared')}
            className={`px-2.5 py-1 rounded-md border ${
              mode === 'shared'
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'border-slate-200 text-slate-600'
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
                : 'border-slate-200 text-slate-600'
            }`}
          >
            每罐各自
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left py-1.5 px-2 border-b border-slate-100 w-20">指标</th>
              <th className="text-left py-1.5 px-2 border-b border-slate-100 w-24">
                空白吸光度(同出水)
              </th>
              <th className="text-left py-1.5 px-2 border-b border-slate-100 w-24">稀释倍数</th>
              {mode === 'shared' ? (
                <>
                  <th className="text-left py-1.5 px-2 border-b border-slate-100">
                    检测样吸光度
                  </th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-24">
                    浓度 mg/L
                  </th>
                </>
              ) : (
                (reactors ?? []).map((r) => (
                  <th key={r.id} className="text-left py-1.5 px-2 border-b border-slate-100">
                    {r.code} 检测样 → 浓度
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {indicators?.map((ind) => {
              const isDirect = ind.method === 'direct';
              const dilution = state.dilution[ind.id!] ?? '';
              return (
                <tr key={ind.id}>
                  <td className="py-1.5 px-2 border-b border-slate-50">
                    {ind.name}
                    {isDirect && <span className="ml-1 text-[10px] text-slate-400">直读</span>}
                  </td>
                  <td className="py-1.5 px-2 border-b border-slate-50 text-slate-400">
                    {isDirect ? '—' : blankByIndicator[ind.id!] || '—'}
                  </td>
                  <td className="py-1.5 px-2 border-b border-slate-50">
                    {isDirect ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <input
                        type="number"
                        step="any"
                        aria-label={`${ind.name} 进水稀释`}
                        className="w-full border border-slate-200 rounded px-2 py-1"
                        value={dilution}
                        onChange={(e) => setDilution(ind.id!, e.target.value)}
                      />
                    )}
                  </td>
                  {mode === 'shared' ? (
                    <>
                      <td className="py-1.5 px-2 border-b border-slate-50">
                        <input
                          type="number"
                          step="any"
                          aria-label={`${ind.name} 进水检测样`}
                          className="w-full border border-slate-200 rounded px-2 py-1"
                          value={state.samples[`${ind.id}:shared`] ?? ''}
                          onChange={(e) => setSample(`${ind.id}:shared`, e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                        {formatNumber(computedValue(ind.id!, state.samples[`${ind.id}:shared`] ?? ''))}
                      </td>
                    </>
                  ) : (
                    (reactors ?? []).map((r) => (
                      <td key={r.id} className="py-1.5 px-2 border-b border-slate-50">
                        <input
                          type="number"
                          step="any"
                          aria-label={`${ind.name} ${r.code} 进水检测样`}
                          className="w-full border border-slate-200 rounded px-2 py-1"
                          value={state.samples[`${ind.id}:${r.id}`] ?? ''}
                          onChange={(e) => setSample(`${ind.id}:${r.id}`, e.target.value)}
                        />
                        <span className="block text-right text-teal-700">
                          {formatNumber(computedValue(ind.id!, state.samples[`${ind.id}:${r.id}`] ?? ''))}
                        </span>
                      </td>
                    ))
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
