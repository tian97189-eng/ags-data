import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Indicator, type IndicatorMethod } from '../../db/schema';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useAppStore } from '../../store/useAppStore';

const METHOD_LABEL: Record<string, string> = {
  absorbance: '吸光度换算',
  direct: '直读',
};

export default function IndicatorSettings() {
  const indicators = useLiveQuery(() => db.indicators.orderBy('sortOrder').toArray(), []);
  const toast = useAppStore((s) => s.toast);

  const [editing, setEditing] = useState<Partial<Indicator> | null>(null);
  const [deleting, setDeleting] = useState<Indicator | null>(null);

  function isBasic(i?: Partial<Indicator>) {
    return i?.category === 'basic' || i?.category === 'extras';
  }

  async function save() {
    if (!editing) return;
    const name = editing.name?.trim();
    if (!name) {
      toast('名称不能为空', 'warning');
      return;
    }
    if (editing.id) {
      await db.indicators.update(editing.id, {
        name,
        unit: editing.unit || 'mg/L',
        method: editing.method ?? 'direct',
        defaultDilution: editing.defaultDilution ?? 1,
        refLow: editing.refLow ?? null,
        refHigh: editing.refHigh ?? null,
        lod: editing.lod ?? null,
      });
    } else {
      const last = await db.indicators.orderBy('sortOrder').last();
      await db.indicators.add({
        name,
        category: 'custom',
        method: editing.method ?? 'direct',
        unit: editing.unit || 'mg/L',
        defaultDilution: editing.defaultDilution ?? 1,
        refLow: editing.refLow ?? null,
        refHigh: editing.refHigh ?? null,
        lod: editing.lod ?? null,
        // 自定义指标默认停用，需要时点"启用"才进入数据录入/全周期
        active: false,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      });
    }
    setEditing(null);
    toast('已保存', 'success');
  }

  async function toggleActive(i: Indicator) {
    await db.indicators.update(i.id!, { active: !i.active });
  }

  async function askDelete(i: Indicator) {
    setDeleting(i);
  }

  async function doDelete() {
    if (!deleting) return;
    if (deleting.category === 'basic' || deleting.category === 'extras') {
      toast('内置指标不能删除，可改为停用', 'warning');
    } else {
      await db.indicators.delete(deleting.id!);
      toast('已删除', 'info');
    }
    setDeleting(null);
  }

  const num = (v: number | null | undefined) => (v == null ? '' : String(v));

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => setEditing({ name: '', unit: 'mg/L', defaultDilution: 1 })}
          className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
        >
          新增自定义指标
        </button>
      </div>

      <div className="text-xs text-slate-500 mb-3 border-l-2 border-teal-200 pl-2">
        新增的自定义指标默认<strong>停用</strong>，需要测量时在下面表格点<strong>「启用」</strong>才会出现在数据录入和全周期。
        不想测了再点「停用」就行，历史数据保留。
      </div>

      <div className="overflow-x-auto -mx-3 px-3">
        <table className="w-full table-fixed border-collapse text-xs min-w-[680px]">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left py-2 px-2 border-b border-slate-200 min-w-[5.5rem] whitespace-nowrap">名称</th>
              <th className="text-left py-2 px-2 border-b border-slate-200 min-w-[5.5rem] whitespace-nowrap">计量方式</th>
              <th className="text-left py-2 px-2 border-b border-slate-200 w-16 whitespace-nowrap">单位</th>
              <th className="text-right py-2 px-2 border-b border-slate-200 w-16 whitespace-nowrap">稀释</th>
              <th className="text-left py-2 px-2 border-b border-slate-200 min-w-[7rem] whitespace-nowrap">参考范围</th>
              <th className="text-right py-2 px-2 border-b border-slate-200 min-w-[7.5rem] whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {indicators?.map((i) => (
              <tr key={i.id}>
                <td className="py-2 px-2 border-b border-slate-100 whitespace-nowrap">
                  {i.name}
                  {i.category === 'custom' && (
                    <span className="ml-1 text-[10px] text-slate-400">自定义</span>
                  )}
                </td>
                <td className="py-2 px-2 border-b border-slate-100 whitespace-nowrap">
                  {METHOD_LABEL[i.method]}
                </td>
                <td className="py-2 px-2 border-b border-slate-100 whitespace-nowrap">{i.unit}</td>
                <td className="py-2 px-2 border-b border-slate-100 text-right whitespace-nowrap">
                  {i.method === 'absorbance' ? `×${i.defaultDilution}` : '—'}
                </td>
                <td className="py-2 px-2 border-b border-slate-100 text-slate-500 whitespace-nowrap">
                  {i.refLow != null || i.refHigh != null
                    ? `${i.refLow ?? '?'} ~ ${i.refHigh ?? '?'}`
                    : '—'}
                </td>
                <td className="py-2 px-2 border-b border-slate-100 text-right space-x-1 whitespace-nowrap">
                  <button type="button" className="text-teal-700" onClick={() => setEditing({ ...i })}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className={i.active ? 'text-slate-500' : 'text-amber-600'}
                    onClick={() => toggleActive(i)}
                  >
                    {i.active ? '停用' : '启用'}
                  </button>
                  {i.category === 'custom' && (
                    <button type="button" className="text-red-600" onClick={() => askDelete(i)}>
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-xl p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium">
              {editing.id ? '编辑指标' : '新增自定义指标'}
            </h3>
            <div className="mt-3 space-y-3 text-xs">
              <label className="block">
                <span className="text-slate-500">名称</span>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                  value={editing.name ?? ''}
                  disabled={isBasic(editing)}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-slate-500">单位</span>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                    value={editing.unit ?? ''}
                    disabled={isBasic(editing)}
                    onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500">默认稀释倍数</span>
                  <input
                    type="number"
                    className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                    value={editing.defaultDilution ?? 1}
                    disabled={editing.method === 'direct'}
                    onChange={(e) =>
                      setEditing({ ...editing, defaultDilution: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label className="block" htmlFor="ind-method">
                <span className="text-slate-500">计量方式</span>
                <select
                  id="ind-method"
                  className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 bg-white disabled:bg-slate-100"
                  value={editing.method ?? 'direct'}
                  disabled={isBasic(editing)}
                  onChange={(e) =>
                    setEditing({ ...editing, method: e.target.value as IndicatorMethod })
                  }
                >
                  <option value="direct">直读浓度（直接填 mg/L）</option>
                  <option value="absorbance">吸光度换算（建标曲后自动算浓度）</option>
                </select>
                {editing.method === 'absorbance' && (
                  <span className="text-[11px] text-amber-600 block mt-1">
                    保存后请到「标准曲线」为该指标建标曲（拟合多点或手动公式）
                  </span>
                )}
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-slate-500">参考下限</span>
                  <input
                    type="number"
                    className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                    value={num(editing.refLow)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        refLow: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500">参考上限</span>
                  <input
                    type="number"
                    className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                    value={num(editing.refHigh)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        refHigh: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500">检出限</span>
                  <input
                    type="number"
                    className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                    value={num(editing.lod)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        lod: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="删除指标"
        message={`确定删除「${deleting?.name}」吗？该指标的历史数据将一并删除。`}
        confirmText="删除"
        danger
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
