import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import {
  resolveOtherCurve,
  saveOtherMeasurement,
  seedOtherReactorsIfEmpty,
  deleteOtherMeasurements,
} from '../../lib/otherEntry';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import HistoryCalendar from '../../components/common/HistoryCalendar';
import Chip from '../../components/common/Chip';

interface CellInput {
  sample: string;
  blank: string;
  dilution: string;
}

/**
 * 他人数据录入 —— 帮别人测水质时的独立空间。
 * 罐和测量数据都走 otherReactors / otherMeasurements，绝不碰自己的反应器和数据。
 */
export default function OtherEntryPage() {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const [showManage, setShowManage] = useState(false);

  const indicators = useLiveQuery(
    () => db.indicators.orderBy('sortOrder').toArray(),
    [],
  );
  const reactors = useLiveQuery(
    () => db.otherReactors.orderBy('sortOrder').toArray(),
    [],
  );
  const records = useLiveQuery(
    () => db.otherMeasurements.orderBy('date').reverse().toArray(),
    [],
  );
  const curves = useLiveQuery(() => db.curves.toArray(), []);

  // 首次使用填充默认他人罐（R1/R2/R3，仅他人空间，不影响自己的）
  useEffect(() => {
    void seedOtherReactorsIfEmpty();
  }, []);

  const activeReactors = (reactors ?? []).filter((r) => r.active);
  const dayRecords = (records ?? []).filter((r) => r.date === date);

  // 各指标生效标曲（按日期）
  const curveFor = (indicatorId: number) => {
    const list = (curves ?? [])
      .filter((c) => c.indicatorId === indicatorId && c.effectiveFrom <= date &&
        (c.effectiveTo === null || c.effectiveTo >= date))
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
    return list[0] ?? null;
  };

  /** 某罐某指标的录入态 */
  const [cells, setCells] = useState<Record<string, CellInput>>({});
  const cellKey = (rid: number, iid: number) => `${rid}:${iid}`;

  // 从已有记录回填当日单元格
  useEffect(() => {
    const next: Record<string, CellInput> = {};
    for (const r of dayRecords) {
      next[cellKey(r.reactorId, r.indicatorId)] = {
        sample: r.sampleAbs != null ? String(r.sampleAbs) : r.value != null ? String(r.value) : '',
        blank: r.blankAbs != null ? String(r.blankAbs) : '',
        dilution: r.dilution != null ? String(r.dilution) : '',
      };
    }
    setCells(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, records]);

  function setCell(rid: number, iid: number, patch: Partial<CellInput>) {
    setCells((p) => {
      const base: CellInput = p[cellKey(rid, iid)] ?? { sample: '', blank: '', dilution: '' };
      return {
        ...p,
        [cellKey(rid, iid)]: { ...base, ...patch },
      };
    });
  }

  /** 实时算某罐某指标浓度（直读 or 吸光度换算） */
  function cellValue(rid: number, ind: { id?: number; method: string; lod: number | null }): number | null {
    if (ind.id == null) return null;
    const c = cells[cellKey(rid, ind.id)] ?? { sample: '', blank: '', dilution: '' };
    if (c.sample === '') return null;
    if (ind.method === 'direct') {
      const v = Number(c.sample);
      return Number.isFinite(v) ? v : null;
    }
    const curve = curveFor(ind.id);
    if (!curve) return null;
    const sample = Number(c.sample);
    const blank = c.blank === '' ? 0 : Number(c.blank);
    const dilution = c.dilution === '' ? 1 : Number(c.dilution);
    if (!Number.isFinite(sample)) return null;
    const raw = (sample - blank - curve.b) / curve.k;
    return raw * dilution;
  }

  async function handleSave() {
    if (!indicators) return;
    for (const rid of activeReactors.map((r) => r.id!)) {
      for (const ind of indicators.filter((i) => i.active)) {
        if (ind.id == null) continue;
        const c = cells[cellKey(rid, ind.id)] ?? { sample: '', blank: '', dilution: '' };
        if (c.sample === '' && c.blank === '' && c.dilution === '') continue;
        const sample = c.sample === '' ? null : Number(c.sample);
        const blank = c.blank === '' ? null : Number(c.blank);
        const dilution = c.dilution === '' ? null : Number(c.dilution);
        if (sample == null && ind.method !== 'direct') continue;
        await saveOtherMeasurement({
          date,
          reactorId: rid,
          indicatorId: ind.id,
          inputType: ind.method as 'absorbance' | 'direct',
          sampleAbs: sample,
          blankAbs: blank,
          dilution,
          curveId: curveFor(ind.id)?.id ?? null,
          lod: ind.lod,
        });
      }
    }
    toast('他人数据已保存（不影响你自己的数据）', 'success');
  }

  async function handleClearDay() {
    if (!activeReactors.length) return;
    for (const r of activeReactors) {
      await deleteOtherMeasurements(date, r.id!);
    }
    setCells({});
    toast(`已清空 ${date} 的他人数据`, 'info');
  }

  const [newCode, setNewCode] = useState('');
  async function handleAddReactor() {
    const code = newCode.trim();
    if (!code) {
      toast('请填罐编号', 'warning');
      return;
    }
    const last = await db.otherReactors.orderBy('sortOrder').last();
    await db.otherReactors.add({
      code, name: code, note: '', active: true,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      createdAt: new Date().toISOString(),
    });
    setNewCode('');
    toast('已添加他人罐', 'success');
  }
  async function handleToggleReactor(r: { id?: number; active: boolean }) {
    if (r.id != null) await db.otherReactors.update(r.id, { active: !r.active });
  }
  async function handleDeleteReactor(r: { id?: number }) {
    if (r.id == null) return;
    await db.otherMeasurements.where('reactorId').equals(r.id).delete();
    await db.otherReactors.delete(r.id);
    toast('已删除他人罐及其数据', 'info');
  }

  const dateSet = new Set((records ?? []).map((r) => r.date));

  return (
    <div>
      <PageHeader
        title="他人数据"
        desc="帮别人测水质时的独立空间，完全不影响你自己的反应器和数据"
        actions={
          <button
            type="button"
            onClick={() => setShowManage((v) => !v)}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
          >
            {showManage ? '收起罐管理' : '罐管理'}
          </button>
        }
      />

      {/* 罐管理（他人空间专用） */}
      {showManage && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4 mb-4">
          <div className="text-base font-medium mb-2">他人罐管理（不影响你自己的 R1/R2/R3）</div>
          <div className="flex gap-2 mb-3">
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="如 B1"
              className="w-28 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={handleAddReactor}
              className="px-3 py-1 text-sm rounded-md bg-teal-600 text-white"
            >
              添加
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(reactors ?? []).map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm"
              >
                <span>{r.code}</span>
                <button
                  type="button"
                  onClick={() => handleToggleReactor(r)}
                  className={r.active ? 'text-teal-700' : 'text-slate-400 dark:text-slate-500'}
                >
                  {r.active ? '启用' : '停用'}
                </button>
                <button type="button" onClick={() => handleDeleteReactor(r)} className="text-red-600">
                  删
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 录入区 */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <label className="flex items-center gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">日期</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700"
          >
            保存当日
          </button>
          <button
            type="button"
            onClick={handleClearDay}
            className="px-3 py-1.5 text-sm rounded-md border border-red-200 text-red-600 hover:bg-red-50"
          >
            清空当日
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          罐：{activeReactors.map((r) => r.code).join('、') || '（暂无启用罐）'} · 用你自己的标准曲线换算浓度，数据存到独立空间。
        </p>

        {activeReactors.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
            请先点右上角「罐管理」添加他人罐
          </div>
        ) : (
          <div className="space-y-3">
            {(indicators ?? []).filter((i) => i.active).map((ind) => {
              const curve = curveFor(ind.id!);
              return (
                <div key={ind.id} className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {ind.name}
                      {ind.method === 'direct' && (
                        <span className="ml-1 text-[11px] text-slate-400 dark:text-slate-500">直读</span>
                      )}
                    </span>
                    {ind.method === 'absorbance' && (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        {curve ? `k=${curve.k.toFixed(4)} b=${curve.b.toFixed(4)}` : '无标曲'}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {activeReactors.map((r) => (
                      <label key={r.id} className="block">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{r.code}</span>
                        {ind.method === 'direct' ? (
                          <input
                            type="number" step="any"
                            aria-label={`${ind.name} ${r.code} 值`}
                            className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm"
                            value={cells[cellKey(r.id!, ind.id!)]?.sample ?? ''}
                            onChange={(e) => setCell(r.id!, ind.id!, { sample: e.target.value })}
                          />
                        ) : (
                          <input
                            type="number" step="any"
                            aria-label={`${ind.name} ${r.code} 吸光度`}
                            className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm"
                            value={cells[cellKey(r.id!, ind.id!)]?.sample ?? ''}
                            onChange={(e) => setCell(r.id!, ind.id!, { sample: e.target.value })}
                          />
                        )}
                        {ind.method === 'absorbance' && (
                          <div className="mt-1 flex gap-1">
                            <input
                              type="number" step="any"
                              aria-label={`${ind.name} ${r.code} 空白`}
                              placeholder="空白"
                              className="w-1/2 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-xs"
                              value={cells[cellKey(r.id!, ind.id!)]?.blank ?? ''}
                              onChange={(e) => setCell(r.id!, ind.id!, { blank: e.target.value })}
                            />
                            <input
                              type="number" step="any"
                              aria-label={`${ind.name} ${r.code} 稀释`}
                              placeholder="稀释"
                              className="w-1/2 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-xs"
                              value={cells[cellKey(r.id!, ind.id!)]?.dilution ?? ''}
                              onChange={(e) => setCell(r.id!, ind.id!, { dilution: e.target.value })}
                            />
                          </div>
                        )}
                        <div className="text-[11px] text-teal-700 mt-0.5 text-right tabular-nums">
                          {cellValue(r.id!, ind)?.toFixed(2) ?? ''}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 历史记录（日历浏览） */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-3">历史记录（{records?.length ?? 0} 条）</div>
        <HistoryCalendar
          dates={dateSet}
          defaultDate={(records ?? [])[0]?.date}
          countLabel={`共 ${records?.length ?? 0} 条`}
        >
          {(d) => {
            const day = (records ?? []).filter((r) => r.date === d);
            if (day.length === 0) {
              return (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                  {d} 没有记录
                </div>
              );
            }
            return (
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {d} · {day.length} 条
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-xs min-w-[480px]">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">罐</th>
                        <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">指标</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">吸光度</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">浓度</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-12">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.map((m) => (
                        <tr key={m.id}>
                          <td className="py-1.5 px-2 border-b border-slate-50">
                            {(reactors ?? []).find((r) => r.id === m.reactorId)?.code ?? `#${m.reactorId}`}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50">
                            {(indicators ?? []).find((i) => i.id === m.indicatorId)?.name ?? `#${m.indicatorId}`}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right tabular-nums">
                            {m.sampleAbs != null ? m.sampleAbs.toFixed(3) : '—'}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700 tabular-nums">
                            {m.value != null ? m.value.toFixed(2) : '—'}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">
                            <button
                              type="button"
                              className="text-red-600"
                              onClick={() => db.otherMeasurements.delete(m.id!)}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }}
        </HistoryCalendar>
      </div>
    </div>
  );
}