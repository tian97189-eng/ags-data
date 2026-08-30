import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type CalibrationCurve,
  type InfluentMode,
} from '../../db/schema';
import { dailyScope, getDefault, getInfluents, getMeasurement, saveInfluent, saveMeasurement, upsertDefault } from '../../lib/entry';
import { today } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import IndicatorCard, { type CellState } from './IndicatorCard';
import { useAppStore } from '../../store/useAppStore';

export default function EntryPage() {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const [influentMode, setInfluentMode] = useState<InfluentMode>('shared');

  const indicators = useLiveQuery(
    async () => {
      const all = await db.indicators.toArray();
      return all
        .filter((i) => i.category === 'basic' && i.active)
        .sort((a, b) => a.sortOrder - b.sortOrder);
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

  const [defaults, setDefaults] = useState<Record<number, { blank: string; dilution: string }>>({});
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [influents, setInfluents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

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
    if (!indicators || !reactors) return;
    let cancelled = false;
    (async () => {
      const scope = dailyScope(date);
      const d: Record<number, { blank: string; dilution: string }> = {};
      for (const ind of indicators) {
        const def = await getDefault(scope, ind.id!);
        d[ind.id!] = {
          blank: def?.blankAbs != null ? String(def.blankAbs) : '',
          dilution: def ? String(def.dilution) : String(ind.defaultDilution),
        };
      }
      const c: Record<string, CellState> = {};
      for (const ind of indicators) {
        for (const r of reactors) {
          const m = await getMeasurement('daily', date, r.id!, ind.id!);
          const dil = m?.dilutionOverridden
            ? String(m.dilution)
            : d[ind.id!].dilution;
          c[`${ind.id}:${r.id}`] = {
            sample: m?.sampleAbs != null ? String(m.sampleAbs) : '',
            dilution: dil,
            dilutionOverridden: m?.dilutionOverridden ?? false,
          };
        }
      }
      const inf = await getInfluents(date);
      const infMap: Record<string, string> = {};
      for (const i of inf) {
        const key = i.reactorId != null ? `${i.reactorId}:${i.indicatorId}` : `shared:${i.indicatorId}`;
        infMap[key] = String(i.value);
      }
      const mode = await db.settings.get('influentMode');
      if (cancelled) return;
      setDefaults(d);
      setCells(c);
      setInfluents(infMap);
      setInfluentMode((mode?.value as InfluentMode) ?? 'shared');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [date, indicators, reactors]);

  function handleDefaultChange(indicatorId: number, blank: string, dilution: string) {
    setDefaults((prev) => ({ ...prev, [indicatorId]: { blank, dilution } }));
    // 同步更新所有非覆盖的 cell 稀释
    setCells((prev) => {
      const next: Record<string, CellState> = {};
      for (const [key, cell] of Object.entries(prev)) {
        if (key.startsWith(`${indicatorId}:`) && !cell.dilutionOverridden) {
          next[key] = { ...cell, dilution };
        } else {
          next[key] = cell;
        }
      }
      return next;
    });
  }

  function handleCellChange(indicatorId: number, reactorId: number, cell: CellState) {
    setCells((prev) => ({ ...prev, [`${indicatorId}:${reactorId}`]: cell }));
  }

  function handleInfluentChange(key: string, value: string) {
    setInfluents((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!indicators || !reactors) return;
    const scope = dailyScope(date);

    for (const ind of indicators) {
      const d = defaults[ind.id!];
      if (!d) continue;
      await upsertDefault(
        scope,
        ind.id!,
        d.blank === '' ? null : Number(d.blank),
        Number(d.dilution) || ind.defaultDilution,
      );
    }

    for (const ind of indicators) {
      const d = defaults[ind.id!];
      for (const r of reactors) {
        const cell = cells[`${ind.id}:${r.id}`];
        if (!cell) continue;
        await saveMeasurement({
          scene: 'daily',
          date,
          phase: null,
          reactorId: r.id!,
          indicatorId: ind.id!,
          sampleAbs: cell.sample === '' ? null : Number(cell.sample),
          blankAbs: d?.blank === '' ? null : Number(d?.blank ?? ''),
          dilution: cell.dilution === '' ? null : Number(cell.dilution),
          blankOverridden: false,
          dilutionOverridden: cell.dilutionOverridden,
          note: '',
        });
      }
    }

    for (const ind of indicators) {
      if (influentMode === 'shared') {
        const v = influents[`shared:${ind.id}`];
        await saveInfluent({
          date, mode: 'shared', reactorId: null, indicatorId: ind.id!,
          value: v === '' || v == null ? null : Number(v),
        });
      } else {
        for (const r of reactors) {
          const v = influents[`${r.id}:${ind.id}`];
          await saveInfluent({
            date, mode: 'perReactor', reactorId: r.id!, indicatorId: ind.id!,
            value: v === '' || v == null ? null : Number(v),
          });
        }
      }
    }
    toast('已保存', 'success');
  }

  return (
    <div>
      <PageHeader title="数据录入" desc="按指标分行、按罐分列，吸光度自动换算为浓度" />

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <label className="flex items-center gap-1 text-xs">
          <span className="text-slate-500">日期</span>
          <input
            type="date"
            className="border border-slate-200 rounded-md px-2 py-1.5"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500">进水</span>
          <button
            type="button"
            onClick={() => setInfluentMode('shared')}
            className={`px-2.5 py-1.5 rounded-md border ${
              influentMode === 'shared'
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            几罐共用
          </button>
          <button
            type="button"
            onClick={() => setInfluentMode('perReactor')}
            className={`px-2.5 py-1.5 rounded-md border ${
              influentMode === 'perReactor'
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            每罐各自
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="ml-auto px-4 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
        >
          保存
        </button>
      </div>

      <div className="border border-slate-200 rounded-lg mb-4 p-3 text-xs">
        <div className="text-slate-500 mb-2">
          进水浓度{influentMode === 'shared' ? '（几罐共用一个数）' : '（每罐分别填）'}
        </div>
        <div className={`grid gap-2 ${influentMode === 'shared' ? 'grid-cols-2 sm:grid-cols-5' : ''}`}>
          {indicators?.map((ind) =>
            influentMode === 'shared' ? (
              <label key={ind.id} className="flex items-center gap-1">
                <span className="text-slate-500 shrink-0">{ind.name}</span>
                <input
                  type="number"
                  step="any"
                  className="w-full border border-slate-200 rounded px-2 py-1"
                  value={influents[`shared:${ind.id}`] ?? ''}
                  onChange={(e) => handleInfluentChange(`shared:${ind.id}`, e.target.value)}
                />
              </label>
            ) : (
              <div key={ind.id}>
                <div className="text-slate-500 mb-1">{ind.name}</div>
                {reactors?.map((r) => (
                  <label key={r.id} className="flex items-center gap-1 mb-1">
                    <span className="text-slate-400 w-8 shrink-0">{r.code}</span>
                    <input
                      type="number"
                      step="any"
                      className="w-full border border-slate-200 rounded px-2 py-1"
                      value={influents[`${r.id}:${ind.id}`] ?? ''}
                      onChange={(e) => handleInfluentChange(`${r.id}:${ind.id}`, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            ),
          )}
        </div>
      </div>

      {!loading && indicators && indicators.length === 0 ? (
        <EmptyState title="没有可录入的指标" desc="请在「系统设置」里启用指标或新建标曲" />
      ) : (
        indicators?.map((ind) => (
          <IndicatorCard
            key={ind.id}
            indicator={ind}
            reactors={reactors ?? []}
            defaultBlank={defaults[ind.id!]?.blank ?? ''}
            defaultDilution={defaults[ind.id!]?.dilution ?? String(ind.defaultDilution)}
            cells={Object.fromEntries(
              (reactors ?? []).map((r) => [
                r.id!,
                cells[`${ind.id}:${r.id}`] ?? { sample: '', dilution: defaults[ind.id!]?.dilution ?? String(ind.defaultDilution), dilutionOverridden: false },
              ]),
            )}
            curve={curvesByIndicator[ind.id!] ?? null}
            onDefaultChange={(b, d) => handleDefaultChange(ind.id!, b, d)}
            onCellChange={(rid, cell) => handleCellChange(ind.id!, rid, cell)}
          />
        ))
      )}
    </div>
  );
}
