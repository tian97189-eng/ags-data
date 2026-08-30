import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Phase } from '../../db/schema';
import { cycleScope, getDefault, getMeasurement, saveMeasurement, upsertDefault } from '../../lib/entry';
import { computeConcentration } from '../../lib/calibration';
import { generateTimes, cycleStats } from '../../lib/cycle';
import { parseClipboardTable, mapPasteToGrid } from '../../lib/paste';
import { formatNumber, today } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import Chip from '../../components/common/Chip';
import { useAppStore } from '../../store/useAppStore';

interface CycleCell {
  sample: string;
  dilution: string;
  dilutionOverridden: boolean;
}

const PHASES: { value: Phase; label: string }[] = [
  { value: null, label: '—' },
  { value: 'anaerobic', label: '厌氧' },
  { value: 'oxic', label: '好氧' },
  { value: 'anoxic', label: '缺氧' },
];

export default function CyclePage() {
  const toast = useAppStore((s) => s.toast);
  const cycles = useLiveQuery(() => db.cycles.orderBy('date').reverse().toArray(), []);
  const indicators = useLiveQuery(
    async () => {
      const all = await db.indicators.toArray();
      return all
        .filter((i) => i.category === 'basic' && i.active)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [],
  );
  const reactors = useLiveQuery(async () => {
    const all = await db.reactors.toArray();
    return all.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);
  const curves = useLiveQuery(() => db.curves.toArray(), []);

  const [cycleId, setCycleId] = useState<number | null>(null);
  const [indicatorId, setIndicatorId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [cells, setCells] = useState<Record<string, CycleCell>>({});
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const [blank, setBlank] = useState('');
  const [dilution, setDilution] = useState('');

  const cycle = cycles?.find((c) => c.id === cycleId) ?? null;
  const indicator = indicators?.find((i) => i.id === indicatorId);

  const times = useMemo(
    () => (cycle ? generateTimes(cycle.startTime, cycle.intervalMinutes, cycle.count) : []),
    [cycle],
  );

  useEffect(() => {
    if (cycleId == null && cycles && cycles.length > 0) setCycleId(cycles[0].id!);
  }, [cycles, cycleId]);

  useEffect(() => {
    if (indicatorId == null && indicators && indicators.length > 0) setIndicatorId(indicators[0].id!);
  }, [indicators, indicatorId]);

  const timeKey = times.join(',');

  useEffect(() => {
    if (!cycle || !indicator || !reactors || !reactors.length) return;
    let cancelled = false;
    (async () => {
      const scope = cycleScope(cycle.id!);
      const def = await getDefault(scope, indicator.id!);
      const defaultDil = def ? String(def.dilution) : String(indicator.defaultDilution);
      const c: Record<string, CycleCell> = {};
      for (const t of times) {
        for (const r of reactors) {
          const m = await getMeasurement('cycle', cycle.date, r.id!, indicator.id!, cycle.id, t);
          c[`${t}:${r.id}`] = {
            sample: m?.sampleAbs != null ? String(m.sampleAbs) : '',
            dilution: m?.dilutionOverridden ? String(m.dilution) : defaultDil,
            dilutionOverridden: m?.dilutionOverridden ?? false,
          };
        }
      }
      const ps = await db.settings.get(`cycle:${cycle.id}:phases`);
      if (cancelled) return;
      setBlank(def?.blankAbs != null ? String(def.blankAbs) : '');
      setDilution(defaultDil);
      setCells(c);
      setPhases((ps?.value as Record<string, Phase>) ?? {});
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, indicatorId, timeKey, reactors]);

  const curve = useMemo(() => {
    if (!indicator) return null;
    const list = (curves ?? [])
      .filter((c) => c.indicatorId === indicator.id && c.effectiveTo === null)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
    return list[0] ?? null;
  }, [curves, indicator]);

  async function handleSave() {
    if (!cycle || !indicator || !reactors) return;
    const scope = cycleScope(cycle.id!);
    await upsertDefault(scope, indicator.id!, blank === '' ? null : Number(blank), Number(dilution) || indicator.defaultDilution);
    for (const t of times) {
      for (const r of reactors) {
        const cell = cells[`${t}:${r.id}`];
        if (!cell) continue;
        await saveMeasurement({
          scene: 'cycle', date: cycle.date, cycleRunId: cycle.id, time: t,
          phase: phases[t] ?? null, reactorId: r.id!, indicatorId: indicator.id!,
          sampleAbs: cell.sample === '' ? null : Number(cell.sample),
          blankAbs: blank === '' ? null : Number(blank),
          dilution: cell.dilution === '' ? null : Number(cell.dilution),
          blankOverridden: false, dilutionOverridden: cell.dilutionOverridden, note: '',
        });
      }
    }
    await db.settings.put({ key: `cycle:${cycle.id}:phases`, value: phases });
    toast('已保存', 'success');
  }

  function onPaste(e: React.ClipboardEvent) {
    if (!cycle || !indicator || !reactors || !reactors.length) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    const grid = parseClipboardTable(text);
    const mapped = mapPasteToGrid(grid, {
      startRow: 0, startCol: 0, maxRows: times.length, maxCols: reactors.length,
    });
    setCells((prev) => {
      const next = { ...prev };
      for (const { r, c, raw } of mapped.cells) {
        const t = times[r];
        const rid = reactors[c].id!;
        const old = next[`${t}:${rid}`] ?? { sample: '', dilution, dilutionOverridden: false };
        next[`${t}:${rid}`] = { ...old, sample: raw };
      }
      return next;
    });
    if (mapped.overflowRows > 0 || mapped.overflowCols > 0) {
      toast(`有 ${mapped.overflowRows} 行、${mapped.overflowCols} 列超出范围未粘贴`, 'warning');
    }
  }

  return (
    <div>
      <PageHeader title="全周期" desc="周期性密集采样的录入与统计" />

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <select
          className="border border-slate-200 rounded-md px-2 py-1.5 text-xs"
          value={cycleId ?? ''}
          onChange={(e) => setCycleId(Number(e.target.value) || null)}
        >
          {!cycles || cycles.length === 0 ? (
            <option value="">暂无周期</option>
          ) : (
            cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
        >
          新建周期
        </button>
        <span className="flex-1"></span>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
        >
          保存
        </button>
      </div>

      {!cycle ? (
        <EmptyState title="还没有周期实验" desc="点「新建周期」，设置起始时间、间隔和点数" />
      ) : (
        <>
          <div className="flex gap-1 flex-wrap mb-3">
            {indicators?.map((i) => (
              <Chip key={i.id} active={i.id === indicatorId} onClick={() => setIndicatorId(i.id!)}>
                {i.name}
              </Chip>
            ))}
          </div>

          {indicator && (
            <div className="flex items-center gap-3 text-xs mb-2">
              <span className="text-slate-500">
                {cycle.startTime} 起 · 每 {cycle.intervalMinutes} 分钟 · 共 {times.length} 点
              </span>
              {indicator.method === 'absorbance' && (
                <>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-500">空白</span>
                    <input
                      type="number"
                      step="any"
                      className="w-20 border border-slate-200 rounded px-2 py-1"
                      value={blank}
                      onChange={(e) => setBlank(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-500">稀释</span>
                    <input
                      type="number"
                      step="any"
                      className="w-20 border border-slate-200 rounded px-2 py-1"
                      value={dilution}
                      onChange={(e) => setDilution(e.target.value)}
                    />
                  </label>
                </>
              )}
              <span className="text-slate-400 ml-auto">可直接从 Excel 框选整块 Ctrl+V 粘贴</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table
              className="w-full table-fixed border-collapse text-xs"
              onPaste={onPaste}
            >
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-2 px-2 border-b border-slate-200 w-16">时间</th>
                  <th className="text-left py-2 px-2 border-b border-slate-200 w-20">阶段</th>
                  {reactors?.map((r) => (
                    <th key={r.id} className="text-left py-2 px-2 border-b border-slate-200">
                      {r.code} {indicator?.method === 'absorbance' ? '吸光度' : '浓度'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((t) => (
                  <tr key={t}>
                    <td className="py-1.5 px-2 border-b border-slate-50">{t}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50">
                      <select
                        className="border border-slate-200 rounded px-1 py-1 text-[11px]"
                        value={phases[t] ?? ''}
                        onChange={(e) =>
                          setPhases((prev) => ({ ...prev, [t]: (e.target.value || null) as Phase }))
                        }
                      >
                        {PHASES.map((p) => (
                          <option key={String(p.value)} value={p.value ?? ''}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    {reactors?.map((r) => {
                      const cell = cells[`${t}:${r.id}`] ?? { sample: '', dilution, dilutionOverridden: false };
                      return (
                        <td key={r.id} className="py-1.5 px-2 border-b border-slate-50">
                          <input
                            type="number"
                            step="any"
                            className="w-full border border-slate-200 rounded px-2 py-1"
                            value={cell.sample}
                            onChange={(e) =>
                              setCells((prev) => ({
                                ...prev,
                                [`${t}:${r.id}`]: { ...cell, sample: e.target.value },
                              }))
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">周期统计（{indicator?.name}）</div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left py-2 px-2 border-b border-slate-200">罐</th>
                    <th className="text-right py-2 px-2 border-b border-slate-200">起始</th>
                    <th className="text-right py-2 px-2 border-b border-slate-200">最低</th>
                    <th className="text-right py-2 px-2 border-b border-slate-200">最高</th>
                    <th className="text-right py-2 px-2 border-b border-slate-200">降到 2 用时</th>
                  </tr>
                </thead>
                <tbody>
                  {reactors?.map((r) => {
                    const values = times.map((t) => {
                      const cell = cells[`${t}:${r.id}`];
                      const v = cell?.sample === '' || !cell ? null : Number(cell.sample);
                      if (indicator?.method === 'direct') return v;
                      // 吸光度需换算
                      return computeForCycle(cell, blank, curve, indicator);
                    });
                    const s = cycleStats(times, values, 2);
                    return (
                      <tr key={r.id}>
                        <td className="py-2 px-2 border-b border-slate-100">{r.code}</td>
                        <td className="py-2 px-2 border-b border-slate-100 text-right">{formatNumber(s.start)}</td>
                        <td className="py-2 px-2 border-b border-slate-100 text-right">{formatNumber(s.min)}</td>
                        <td className="py-2 px-2 border-b border-slate-100 text-right">{formatNumber(s.max)}</td>
                        <td className="py-2 px-2 border-b border-slate-100 text-right">
                          {s.timeToTarget != null ? `${s.timeToTarget} 分钟` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showNew && (
        <NewCycleForm
          reactors={reactors ?? []}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            setCycleId(id);
            toast('周期已创建', 'success');
          }}
        />
      )}
    </div>
  );
}

function computeForCycle(cell: CycleCell | undefined, blank: string, curve: any, indicator: any): number | null {
  if (!cell || cell.sample === '') return null;
  if (indicator.method === 'direct') return Number(cell.sample);
  return computeConcentration({
    sampleAbs: Number(cell.sample),
    blankAbs: blank === '' ? null : Number(blank),
    dilution: cell.dilution === '' ? null : Number(cell.dilution),
    curve,
    lod: indicator.lod,
  }).value;
}

function NewCycleForm({
  reactors,
  onClose,
  onCreated,
}: {
  reactors: { id?: number; code: string }[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState('08:00');
  const [interval, setInterval] = useState('30');
  const [count, setCount] = useState('13');
  const [reactorIds, setReactorIds] = useState<number[]>(reactors.map((r) => r.id!));

  async function create() {
    const rid = reactorIds.filter((id) => id != null);
    const id = await db.cycles.add({
      date,
      name: `${date} 周期`,
      startTime,
      intervalMinutes: Number(interval) || 30,
      count: Number(count) || 1,
      reactorIds: rid,
      note: '',
    });
    onCreated(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium">新建周期</h3>
        <div className="mt-3 space-y-3 text-xs">
          <label className="block">
            <span className="text-slate-500">日期</span>
            <input type="date" className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-slate-500">起始</span>
              <input type="time" className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-slate-500">间隔(分)</span>
              <input type="number" className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5" value={interval} onChange={(e) => setInterval(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-slate-500">点数</span>
              <input type="number" className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5" value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
          </div>
          <div>
            <span className="text-slate-500">参与反应器</span>
            <div className="flex gap-3 mt-1 flex-wrap">
              {reactors.map((r) => (
                <label key={r.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={reactorIds.includes(r.id!)}
                    onChange={(e) =>
                      setReactorIds((prev) =>
                        e.target.checked ? [...prev, r.id!] : prev.filter((x) => x !== r.id),
                      )
                    }
                  />
                  {r.code}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600">取消</button>
          <button type="button" onClick={create} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white">创建</button>
        </div>
      </div>
    </div>
  );
}
