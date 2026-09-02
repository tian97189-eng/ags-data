import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalibrationCurve } from '../../db/schema';
import { dailyScope, deleteDailyData, getDefault, getMeasurement, saveMeasurement, upsertDefault } from '../../lib/entry';
import { recomputeAndSaveComposites } from '../../lib/calibration';
import { today } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DatePicker from '../../components/common/DatePicker';
import IndicatorCard, { type CellState } from './IndicatorCard';
import InfluentPanel, { type InfluentPanelHandle } from './InfluentPanel';
import { useAppStore } from '../../store/useAppStore';

export default function EntryPage() {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const influentRef = useRef<InfluentPanelHandle>(null);

  const markedDates = useLiveQuery(
    async () => {
      const dates = new Set<string>();
      const ms = await db.measurements.where('scene').equals('daily').toArray();
      for (const m of ms) dates.add(m.date);
      const infs = await db.influents.toArray();
      for (const i of infs) dates.add(i.date);
      return dates;
    },
    [],
  ) ?? new Set<string>();

  const indicators = useLiveQuery(
    async () => {
      const all = await db.indicators.toArray();
      return all
        .filter((i) => i.active && i.category !== 'extras')
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
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [influentKey, setInfluentKey] = useState(0);

  // 出水空白（供进水面板实时共用）
  const outBlank = useMemo(() => {
    const map: Record<number, string> = {};
    for (const ind of indicators ?? []) map[ind.id!] = defaults[ind.id!]?.blank ?? '';
    return map;
  }, [indicators, defaults]);

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
      if (cancelled) return;
      setDefaults(d);
      setCells(c);
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
        // composite 指标（自动求和）不保存吸光度/稀释等，只由 recomputeAndSaveComposites 算
        if (ind.compositeType === 'sumOf') continue;
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

    // 联动重算所有 composite 指标（总氮等）并写入 measurement
    await recomputeAndSaveComposites(date);

    await influentRef.current?.save();
    toast('已保存', 'success');
  }

  async function handleClear() {
    await deleteDailyData(date);
    // 重置出水界面
    setCells({});
    if (indicators) {
      const d: Record<number, { blank: string; dilution: string }> = {};
      for (const ind of indicators) d[ind.id!] = { blank: '', dilution: String(ind.defaultDilution) };
      setDefaults(d);
    }
    setInfluentKey((k) => k + 1); // 强制进水面板重挂载刷新
    setConfirmClear(false);
    toast('已清空当日数据', 'info');
  }

  return (
    <div>
      <PageHeader title="数据录入" desc="按指标分行、按罐分列，吸光度自动换算为浓度" />

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <label className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">日期</span>
          <DatePicker value={date} markedDates={markedDates} onChange={setDate} />
        </label>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="px-3 py-1.5 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50"
        >
          清空当日
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="ml-auto px-4 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
        >
          保存
        </button>
      </div>

      <InfluentPanel key={influentKey} ref={influentRef} date={date} blankByIndicator={outBlank} />

      {!loading && indicators && indicators.length === 0 ? (
        <EmptyState title="没有可录入的指标" desc="请在「系统设置」里启用指标或新建标曲" />
      ) : (
        indicators?.map((ind) => (
          <IndicatorCard
            key={ind.id}
            indicator={ind}
            reactors={reactors ?? []}
            date={date}
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

      <ConfirmDialog
        open={confirmClear}
        title="清空当日数据"
        message={`确定清空 ${date} 的全部录入数据吗？\n包括所有指标的测量值和进水记录，此操作不可撤销。`}
        confirmText="清空"
        danger
        onConfirm={handleClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
