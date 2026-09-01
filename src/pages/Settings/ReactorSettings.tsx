import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Reactor } from '../../db/schema';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';
import { useAppStore } from '../../store/useAppStore';

export default function ReactorSettings() {
  const reactors = useLiveQuery(() => db.reactors.orderBy('sortOrder').toArray(), []);
  const toast = useAppStore((s) => s.toast);

  const [editing, setEditing] = useState<Partial<Reactor> | null>(null);
  const [deleting, setDeleting] = useState<Reactor | null>(null);
  const [deleteCount, setDeleteCount] = useState(0);

  async function save() {
    if (!editing) return;
    const code = editing.code?.trim();
    if (!code) {
      toast('编号不能为空', 'warning');
      return;
    }
    if (editing.id) {
      await db.reactors.update(editing.id, {
        code,
        name: editing.name?.trim() || code,
        note: editing.note?.trim() || '',
      });
    } else {
      const last = await db.reactors.orderBy('sortOrder').last();
      await db.reactors.add({
        code,
        name: editing.name?.trim() || code,
        note: editing.note?.trim() || '',
        active: true,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        createdAt: new Date().toISOString(),
      });
    }
    setEditing(null);
    toast('已保存', 'success');
  }

  async function toggleActive(r: Reactor) {
    await db.reactors.update(r.id!, { active: !r.active });
  }

  async function askDelete(r: Reactor) {
    const count = await db.measurements.where('reactorId').equals(r.id!).count();
    setDeleteCount(count);
    setDeleting(r);
  }

  async function doDelete() {
    if (!deleting) return;
    await db.reactors.delete(deleting.id!);
    setDeleting(null);
    toast('已删除', 'info');
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => setEditing({ code: '', name: '', note: '' })}
          className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
        >
          新增反应器
        </button>
      </div>

      {!reactors || reactors.length === 0 ? (
        <EmptyState title="还没有反应器" desc="点右上角新增一个罐，比如 R1" />
      ) : (
        <div className="overflow-x-auto -mx-3 px-3">
          <table className="w-full table-fixed border-collapse text-xs min-w-[640px]">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left py-2 px-2 border-b border-slate-200 w-16 whitespace-nowrap">编号</th>
                <th className="text-left py-2 px-2 border-b border-slate-200 min-w-[6rem] whitespace-nowrap">显示名</th>
                <th className="text-left py-2 px-2 border-b border-slate-200 min-w-[8rem] whitespace-nowrap">备注</th>
                <th className="text-left py-2 px-2 border-b border-slate-200 w-20 whitespace-nowrap">状态</th>
                <th className="text-right py-2 px-2 border-b border-slate-200 min-w-[7.5rem] whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {reactors.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 px-2 border-b border-slate-100 whitespace-nowrap">{r.code}</td>
                  <td className="py-2 px-2 border-b border-slate-100 whitespace-nowrap">{r.name}</td>
                  <td className="py-2 px-2 border-b border-slate-100 text-slate-500 whitespace-nowrap">{r.note || '—'}</td>
                  <td className="py-2 px-2 border-b border-slate-100 whitespace-nowrap">
                    {r.active ? (
                      <span className="text-teal-700">启用</span>
                    ) : (
                      <span className="text-slate-400">停用</span>
                    )}
                  </td>
                  <td className="py-2 px-2 border-b border-slate-100 text-right space-x-1 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-teal-700"
                      onClick={() => setEditing({ ...r })}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className={r.active ? 'text-slate-500' : 'text-amber-600'}
                      onClick={() => toggleActive(r)}
                    >
                      {r.active ? '停用' : '启用'}
                    </button>
                    <button type="button" className="text-red-600" onClick={() => askDelete(r)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-xl p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-medium">{editing.id ? '编辑反应器' : '新增反应器'}</h3>
            <div className="mt-3 space-y-3 text-xs">
              <label className="block">
                <span className="text-slate-500">编号</span>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                  value={editing.code ?? ''}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-slate-500">显示名</span>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-slate-500">备注</span>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
                  value={editing.note ?? ''}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                />
              </label>
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
        title="删除反应器"
        message={
          deleteCount > 0
            ? `该罐有 ${deleteCount} 条历史数据。删除后历史数据仍保留，但将无法再对应到罐名。建议改用「停用」。确定删除吗？`
            : '确定删除该反应器吗？'
        }
        confirmText="删除"
        danger
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
