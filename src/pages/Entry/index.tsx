import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalibrationCurve } from '../../db/schema';
import { dailyScope, deleteDailyDataToTrash, getDefault, getMeasurement, saveMeasurement, upsertDefault } from '../../lib/entry';
import { recomputeAndSaveComposites } from '../../lib/calibration';
import { today, prevDay } from '../../lib/format';
import { saveDraft, loadDraft, clearDraft, isDraftEmpty, type Draft } from '../../lib/draft';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DatePicker from '../../components/common/DatePicker';
import IndicatorCard, { type CellState } from './IndicatorCard';
import InfluentPanel, { type InfluentPanelHandle, type InfluentSnapshot } from './InfluentPanel';
import { useAppStore } from '../../store/useAppStore';

/** 当日 DB 里是否已有任何测量/进水记录 */
async function hasAnySavedData(date: string): Promise<boolean> {
  const m = await db.measurements
    .where('scene')
    .equals('daily')
    .filter((x) => x.date === date)
    .count();
  const i = await db.influents.where('date').equals(date).count();
  return m > 0 || i > 0;
}

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
  const [offerRestore, setOfferRestore] = useState<Draft | null>(null);
  const influentSnapRef = useRef<InfluentSnapshot>({ dilution: {}, samples: {} });
  // ref 同步保存最新 cells/defaults（避免 setState 异步闭包 + 修复手机端 600ms 防抖丢草稿）
  const cellsRef = useRef<Record<string, CellState>>({});
  const defaultsRef = useRef<Record<number, { blank: string; dilution: string }>>({});
  // 跨日期恢复：用户从草稿日期恢复时先把值暂存，等数据加载 effect 跑完（该日期）后填入，避免被加载结果覆盖
  const pendingRestoreRef = useRef<Draft | null>(null);

  /** 立即同步落盘：用 ref 读最新 cells/defaults（不依赖 React 闭包）。
   * 手机端必须立即写——600ms 防抖 + cleanup 链 + 杀进程任何环节都可能丢草稿 */
  function persistDraft() {
    const payload = {
      date,
      defaults: defaultsRef.current,
      cells: cellsRef.current,
      influent: influentSnapRef.current,
    };
    if (!isDraftEmpty(payload)) saveDraft(payload);
  }

  // 出水 cells/defaults 变化 → 同步保存（无防抖；本地写入纳秒级、用户场景零性能影响）
  useEffect(() => {
    cellsRef.current = cells;
    defaultsRef.current = defaults;
    if (loading) return;
    persistDraft();
  }, [defaults, cells, loading]);

  // 进水面板快照变化回调（由 InfluentPanel onStateChange 调用）→ 立即保存
  function handleInfluentChange(s: InfluentSnapshot) {
    influentSnapRef.current = s;
    persistDraft();
  }

  // 页面切后台/关闭前最后保险（ref 仍是最新的）
  useEffect(() => {
    if (loading) return;
    const flush = () => persistDraft();
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, [date, defaults, cells, loading]);

  // 数据加载完成后检查：草稿存在且非空、且当前日期没有已存数据 → 提示恢复。
  // 注意：不要求草稿日期 == 当前日期（用户录一半隔天再开也提示，否则草稿永远找不到）
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      const draft = loadDraft();
      if (draft && !isDraftEmpty(draft)) {
        const hasData = await hasAnySavedData(date);
        if (cancelled) return;
        setOfferRestore(hasData ? null : draft);
      } else {
        setOfferRestore(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, loading]);

  function handleRestoreDraft() {
    if (!offerRestore) return;
    setOfferRestore(null);
    const d = offerRestore;
    if (d.date !== date) {
      // 草稿是别的日期的 → 切到那天（等加载完成后由 pendingRestoreRef 填入）
      pendingRestoreRef.current = d;
      setDate(d.date);
      toast(`已切换日期并恢复 ${d.date} 的草稿，请核对后再保存`, 'success');
      return;
    }
    applyRestore(d);
  }

  /** 把草稿内容填入当前表单 */
  function applyRestore(d: Draft) {
    setDefaults(d.defaults ?? {});
    setCells(d.cells ?? {});
    if (d.influent) influentRef.current?.restoreDraft(d.influent);
    toast('已恢复上次草稿，请核对后再保存', 'success');
  }

  function handleDiscardDraft() {
    clearDraft();
    setOfferRestore(null);
    toast('草稿已丢弃', 'info');
  }

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
      if (pendingRestoreRef.current && pendingRestoreRef.current.date === date) {
        // 跨日期恢复：该日期 db 大概率无数据 → 直接填草稿值（不让空加载覆盖）
        setDefaults(pendingRestoreRef.current.defaults ?? {});
        setCells(pendingRestoreRef.current.cells ?? {});
        pendingRestoreRef.current = null;
      } else {
        setDefaults(d);
        setCells(c);
      }
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

  /** 复制前一天出水吸光度到今天（空白/稀释默认不复制，进水不复制） */
  async function handleCopyYesterday() {
    const prev = prevDay(date);
    const list = await db.measurements
      .where('scene')
      .equals('daily')
      .filter((m) => m.date === prev && m.sampleAbs != null)
      .toArray();
    if (list.length === 0) {
      toast(`昨天（${prev}）没有可复制的出水数据`, 'info');
      return;
    }
    setCells((cur) => {
      const next: Record<string, CellState> = {};
      for (const m of list) {
        const key = `${m.indicatorId}:${m.reactorId}`;
        const old = cur[key];
        if (!old) continue; // 停用/新增格子跳过，不误写
        next[key] = {
          sample: m.sampleAbs != null ? String(m.sampleAbs) : old.sample,
          dilution:
            m.dilutionOverridden && m.dilution != null ? String(m.dilution) : old.dilution,
          dilutionOverridden: m.dilutionOverridden ?? false,
        };
      }
      return { ...cur, ...next };
    });
    toast(`已从 ${prev} 复制 ${list.length} 格出水吸光度（进水请手动录入）`, 'success');
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
    clearDraft();
    toast('已保存', 'success');
  }

  async function handleClear() {
    await deleteDailyDataToTrash(date);
    clearDraft();
    // 重置出水界面
    setCells({});
    if (indicators) {
      const d: Record<number, { blank: string; dilution: string }> = {};
      for (const ind of indicators) d[ind.id!] = { blank: '', dilution: String(ind.defaultDilution) };
      setDefaults(d);
    }
    setInfluentKey((k) => k + 1); // 强制进水面板重挂载刷新
    setConfirmClear(false);
    toast('已清空当日数据（可在「查询整理 → 回收站」恢复）', 'info');
  }

  return (
    <div>
      <PageHeader title="数据录入" desc="按指标分行、按罐分列，吸光度自动换算为浓度" />

      {/* 恢复草稿提示：放到最顶部，避免手机端被表单挤压看不见 */}
      {offerRestore && (
        <div className="mb-3 flex items-center gap-2 flex-wrap border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 rounded-lg px-3 py-2 text-xs">
          <span className="text-amber-800 dark:text-amber-300">
            发现{' '}
            {offerRestore.date === today() ? '今天' : offerRestore.date} 的未保存草稿（保存于{' '}
            {new Date(offerRestore.savedAt).toLocaleTimeString('zh-CN', { hour12: false })}），要恢复吗？
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={handleRestoreDraft}
            className="px-3 py-1 rounded-md bg-amber-500 text-white hover:bg-amber-600"
          >
            恢复草稿
          </button>
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="px-3 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-400"
          >
            丢弃
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <label className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 dark:text-slate-400">日期</span>
          <DatePicker value={date} markedDates={markedDates} onChange={setDate} />
        </label>
        <button
          type="button"
          onClick={() => void handleCopyYesterday()}
          className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-teal-400"
          title={`把 ${prevDay(date)} 的出水吸光度复制到 ${date}`}
        >
          复制昨天
        </button>
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
          className="ml-auto px-4 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 hidden md:block"
        >
          保存
        </button>
      </div>

      {/* 手机端吸底保存：数据多时不用滚回顶部就能保存（置于底部导航上方） */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 px-3 pb-2 pointer-events-none">
        <div className="pointer-events-auto max-w-3xl mx-auto">
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-2.5 text-sm font-medium rounded-xl bg-teal-600 text-white shadow-lg active:bg-teal-700"
          >
            保存今日数据
          </button>
        </div>
      </div>

      {/* 恢复草稿提示已移至顶部，避免被表单挤压看不见 */}

      <InfluentPanel key={influentKey} ref={influentRef} date={date} blankByIndicator={outBlank} onStateChange={handleInfluentChange} />

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

      <div className="h-16 md:hidden" />

      <ConfirmDialog
        open={confirmClear}
        title="清空当日数据"
        message={`确定清空 ${date} 的全部录入数据吗？\n包括所有指标的测量值和进水记录。\n清空后进入回收站，30 天内可在「查询整理 → 回收站」恢复。`}
        confirmText="清空"
        danger
        onConfirm={handleClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
