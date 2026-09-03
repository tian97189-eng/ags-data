import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import {
  listTrash,
  restoreTrash,
  purgeTrash,
  emptyTrash,
  TRASH_GROUP_LABEL,
  type TrashGroup,
} from '../../lib/trash';
import { useAppStore } from '../../store/useAppStore';

/** 表名 → 展示用中文（回收站条目副标题） */
const TABLE_LABEL: Record<string, string> = {
  measurements: '测量数据',
  influents: '进水',
  defaults: '空白/稀释设置',
  mlssRecords: '污泥浓度',
  epsRecords: 'EPS（PS/PN）',
  sviRecords: '沉降性 SVI',
  particleSizeRecords: '筛分粒径',
  particleSizeRanges: '粒径配置',
  otherMeasurements: '他人罐测量',
  experimentRecords: '实验记录',
  curves: '标准曲线',
  otherReactors: '他人罐',
  reactors: '反应器',
  indicators: '指标',
};

/** 展示顺序：录入 → 全周期 → 其他指标系列 → 他人数据 → 实验记录 → 标准曲线 */
const GROUP_ORDER: TrashGroup[] = ['daily', 'cycle', 'mlss', 'particle', 'svi', 'eps', 'other', 'experiment', 'curve', 'params'];

/** 时间格式：YYYY-MM-DD HH:mm */
function fmt(dt: string): string {
  return dt.slice(0, 19).replace('T', ' ');
}

export default function TrashSettings() {
  const toast = useAppStore((s) => s.toast);
  const items = useLiveQuery(async () => listTrash(), [], []);

  async function handleRestore(id: number) {
    const n = await restoreTrash(id);
    toast(`已恢复 ${n} 条数据`, 'success');
  }
  async function handlePurge(id: number) {
    await purgeTrash(id);
    toast('已彻底删除', 'info');
  }
  async function handleEmptyAll() {
    if (!window.confirm('确定清空回收站？所有数据将被永久删除，不可恢复。')) return;
    await emptyTrash();
    toast('回收站已清空', 'info');
  }

  // 按组归类（保持 GROUP_ORDER 顺序，组内按删除时间新→旧）
  const grouped: { group: TrashGroup; items: NonNullable<typeof items> }[] = GROUP_ORDER.map((g) => ({
    group: g,
    items: (items ?? []).filter((x) => x.group === g),
  })).filter((g) => g.items.length > 0);
  const total = items?.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          删除的数据先进回收站，30 天内可恢复（过期自动清理）。按来源分类，一眼看出删的是哪部分。
        </p>
        {total > 0 && (
          <button
            type="button"
            onClick={() => void handleEmptyAll()}
            className="px-2.5 py-1 text-xs rounded-md border border-red-200 text-red-600 dark:border-red-800"
          >
            清空回收站
          </button>
        )}
      </div>

      {items == null ? (
        <div className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">加载中…</div>
      ) : grouped.length === 0 ? (
        <div className="text-sm text-slate-400 dark:text-slate-500 py-10 text-center">
          回收站是空的——删除的数据会按分类出现在这里
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ group, items: groupItems }) => (
            <section
              key={group}
              className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  {TRASH_GROUP_LABEL[group]}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {groupItems.reduce((s, x) => s + x.count, 0)} 条
                </span>
              </div>
              <div className="space-y-1.5">
                {groupItems.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[13px]">
                        {TABLE_LABEL[t.table] ?? t.table} · {t.count} 条
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">
                        删除于 {fmt(t.deletedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestore(t.id)}
                      className="px-2 py-1 rounded bg-teal-600 text-white text-xs"
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePurge(t.id)}
                      className="px-2 py-1 rounded border border-red-200 text-red-600 dark:border-red-800 text-xs"
                    >
                      彻底删除
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
