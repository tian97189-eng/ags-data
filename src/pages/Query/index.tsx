import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Measurement, type Scene } from '../../db/schema';
import { matchFilter, sortMeasurements, type SortKey, type SortDir } from '../../lib/query';
import { buildExportRows, buildWorkbook, downloadWorkbook } from '../../lib/excel';
import { formatNumber } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useAppStore } from '../../store/useAppStore';

const PHASE_LABEL: Record<string, string> = { anaerobic: '厌氧', oxic: '好氧', anoxic: '缺氧' };

export default function QueryPage() {
  const toast = useAppStore((s) => s.toast);
  const measurements = useLiveQuery(() => db.measurements.toArray(), []);
  const reactors = useLiveQuery(() => db.reactors.orderBy('sortOrder').toArray(), []);
  const indicators = useLiveQuery(() => db.indicators.orderBy('sortOrder').toArray(), []);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reactorIds, setReactorIds] = useState<number[]>([]);
  const [indicatorIds, setIndicatorIds] = useState<number[]>([]);
  const [scene, setScene] = useState<Scene | 'all'>('all');
  const [phase, setPhase] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Measurement | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editNote, setEditNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rMap = useMemo(() => new Map((reactors ?? []).map((r) => [r.id, r])), [reactors]);
  const iMap = useMemo(() => new Map((indicators ?? []).map((i) => [i.id, i])), [indicators]);

  const rows = useMemo(() => {
    const filtered = (measurements ?? []).filter((m) =>
      matchFilter(m, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        reactorIds: reactorIds.length ? reactorIds : undefined,
        indicatorIds: indicatorIds.length ? indicatorIds : undefined,
        scene,
        phase: phase ? (phase as Measurement['phase']) : undefined,
        keyword: keyword || undefined,
      }),
    );
    return sortMeasurements(filtered, sortKey, sortDir);
  }, [measurements, dateFrom, dateTo, reactorIds, indicatorIds, scene, phase, keyword, sortKey, sortDir]);

  function toggleReactor(id: number) {
    setReactorIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function toggleIndicator(id: number) {
    setIndicatorIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function toggleSelect(id: number) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function openEdit(m: Measurement) {
    setEditing(m);
    setEditValue(m.value != null ? String(m.value) : '');
    setEditNote(m.note ?? '');
  }

  async function saveEdit() {
    if (!editing) return;
    await db.measurements.update(editing.id!, {
      value: editValue === '' ? null : Number(editValue),
      note: editNote,
    });
    setEditing(null);
    toast('已保存', 'success');
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    await db.measurements.bulkDelete(ids);
    setSelected(new Set());
    setConfirmDelete(false);
    toast(`已删除 ${ids.length} 条`, 'info');
  }

  async function handleExport() {
    const exportRows = await buildExportRows(rows);
    const wb = buildWorkbook(exportRows);
    downloadWorkbook(wb, 'AGS数据导出.xlsx');
    toast('已导出', 'success');
  }

  return (
    <div>
      <PageHeader
        title="查询整理"
        desc="筛选、排序、搜索与导出"
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white disabled:opacity-40"
          >
            导出 Excel
          </button>
        }
      />

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-3 mb-3 text-xs space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1">
            <span className="text-slate-500 dark:text-slate-400">从</span>
            <input type="date" className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-slate-500 dark:text-slate-400">到</span>
            <input type="date" className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <select className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={scene} onChange={(e) => setScene(e.target.value as Scene | 'all')}>
            <option value="all">全部类型</option>
            <option value="daily">日常</option>
            <option value="cycle">全周期</option>
          </select>
          <select className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value="">全部阶段</option>
            <option value="anaerobic">厌氧</option>
            <option value="oxic">好氧</option>
            <option value="anoxic">缺氧</option>
          </select>
          <input
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 w-32"
            placeholder="搜索备注"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 dark:text-slate-400 shrink-0">罐：</span>
          {reactors?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleReactor(r.id!)}
              className={`px-2 py-0.5 rounded border ${reactorIds.includes(r.id!) ? 'bg-teal-50 border-teal-300 text-teal-800' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
            >
              {r.code}
            </button>
          ))}
          <span className="text-slate-500 dark:text-slate-400 shrink-0 ml-3">指标：</span>
          {indicators?.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => toggleIndicator(i.id!)}
              className={`px-2 py-0.5 rounded border ${indicatorIds.includes(i.id!) ? 'bg-teal-50 border-teal-300 text-teal-800' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
            >
              {i.name}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">已选 {selected.size} 条</span>
          <button type="button" className="text-red-600" onClick={() => setConfirmDelete(true)}>
            批量删除
          </button>
          <button type="button" className="text-slate-500 dark:text-slate-400" onClick={() => setSelected(new Set())}>
            取消选择
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="没有符合条件的数据" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="text-left py-2 px-2 border-b border-slate-200 dark:border-slate-700 w-8">
                  <input type="checkbox" checked={selected.size === rows.length} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id!)) : new Set())} />
                </th>
                <th className="text-left py-2 px-2 border-b border-slate-200 dark:border-slate-700" onClick={() => { setSortKey('date'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>日期</th>
                <th className="text-left py-2 px-2 border-b border-slate-200 dark:border-slate-700">类型</th>
                <th className="text-left py-2 px-2 border-b border-slate-200 dark:border-slate-700">时间</th>
                <th className="text-left py-2 px-2 border-b border-slate-200 dark:border-slate-700">罐</th>
                <th className="text-left py-2 px-2 border-b border-slate-200 dark:border-slate-700">指标</th>
                <th className="text-right py-2 px-2 border-b border-slate-200 dark:border-slate-700" onClick={() => { setSortKey('value'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>浓度 mg/L</th>
                <th className="text-left py-2 px-2 border-b border-slate-200 dark:border-slate-700">备注</th>
                <th className="text-right py-2 px-2 border-b border-slate-200 dark:border-slate-700 w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800">
                    <input type="checkbox" checked={selected.has(m.id!)} onChange={() => toggleSelect(m.id!)} />
                  </td>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800">{m.date}</td>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800">{m.scene === 'daily' ? '日常' : '周期'}</td>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800">{m.time ?? '—'}</td>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800">{rMap.get(m.reactorId)?.code ?? `#${m.reactorId}`}</td>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800">
                    {iMap.get(m.indicatorId)?.name ?? `#${m.indicatorId}`}
                    {m.phase && <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">{PHASE_LABEL[m.phase]}</span>}
                  </td>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800 text-right font-medium">{formatNumber(m.value)}</td>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">{m.note || '—'}</td>
                  <td className="py-2 px-2 border-b border-slate-100 dark:border-slate-800 text-right space-x-1">
                    <button type="button" className="text-teal-700" onClick={() => openEdit(m)}>编辑</button>
                    <button type="button" className="text-red-600" onClick={() => { setSelected(new Set([m.id!])); setConfirmDelete(true); }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setEditing(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium">编辑记录</h3>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {editing.date} · {rMap.get(editing.reactorId)?.code} · {iMap.get(editing.indicatorId)?.name}
            </div>
            <div className="mt-3 space-y-3 text-xs">
              <label className="block">
                <span className="text-slate-500 dark:text-slate-400">浓度 mg/L</span>
                <input type="number" step="any" className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-slate-500 dark:text-slate-400">备注</span>
                <input className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">取消</button>
              <button type="button" onClick={saveEdit} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white">保存</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="删除数据"
        message={`确定删除选中的 ${selected.size} 条数据吗？此操作不可撤销。`}
        confirmText="删除"
        danger
        onConfirm={deleteSelected}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
