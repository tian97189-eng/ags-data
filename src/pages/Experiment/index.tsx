import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';

/** 把图片文件读成 base64 DataURL（可 JSON 序列化、能进备份） */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 实验记录：时间线排版，记录"哪个阶段干了什么 / 加了什么 / 测了哪些指标"，
 * 每条记录可附照片（手机拍照或相册选图，存 base64 本地库，可进备份）。
 */
export default function ExperimentPage() {
  const toast = useAppStore((s) => s.toast);
  const records = useLiveQuery(
    () => db.experimentRecords.orderBy('date').reverse().toArray(),
    [],
  );
  const indicators = useLiveQuery(() => db.indicators.toArray(), []);

  // 新增表单
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [checkedInd, setCheckedInd] = useState<Record<number, boolean>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      const urls = await Promise.all(files.map(fileToDataUrl));
      setPhotos((p) => [...p, ...urls].slice(0, 9)); // 最多 9 张
    } catch {
      toast('图片读取失败', 'warning');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleAdd() {
    if (!date || !title.trim()) {
      toast('请填日期和标题', 'warning');
      return;
    }
    const indNames = (indicators ?? [])
      .filter((i) => i.id != null && checkedInd[i.id!])
      .map((i) => i.name);
    await db.experimentRecords.add({
      date,
      title: title.trim(),
      content: content.trim(),
      indicators: indNames,
      photos,
      createdAt: new Date().toISOString(),
    });
    toast('已记录', 'success');
    setTitle('');
    setContent('');
    setCheckedInd({});
    setPhotos([]);
  }

  async function handleDelete(id: number) {
    await db.experimentRecords.delete(id);
  }

  return (
    <div>
      <PageHeader
        title="实验记录"
        desc="时间线记录实验过程：哪个阶段做了什么、加了什么、测了哪些指标，可附污泥照片"
      />

      {/* 新增卡片 */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4 mb-4">
        <div className="text-base font-medium mb-1">新增一条记录</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">日期</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">标题（如"第 3 天：换水 + 加碳源"）</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm"
            />
          </label>
        </div>

        <label className="block mb-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">详细内容</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="比如：换了 1L 进水，加了 0.5g 碳源，观察到颗粒污泥变多……"
            className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm"
          />
        </label>

        <div className="mb-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">测了哪些指标（可多选）</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(indicators ?? []).filter((i) => i.active).map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() =>
                  setCheckedInd((p) => ({ ...p, [i.id!]: !p[i.id!] }))
                }
                className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                  checkedInd[i.id!]
                    ? 'bg-brand-50 border-brand-200 text-brand-800 font-medium'
                    : 'border-slate-200 text-slate-600 dark:text-slate-400 dark:border-slate-700'
                }`}
              >
                {i.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">照片（{photos.length}/9）</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img
                  src={p}
                  alt={`照片${i + 1}`}
                  className="w-20 h-20 object-cover rounded-md border border-slate-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] leading-none"
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < 9 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-md border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 text-xs flex flex-col items-center justify-center gap-1"
              >
                <span className="text-lg leading-none">+</span>
                拍照/选图
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => void handlePickPhotos(e)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAdd}
            className="px-4 py-1.5 text-sm rounded-md bg-brand-600 text-white hover:bg-brand-700"
          >
            添加记录
          </button>
        </div>
      </div>

      {/* 时间线 */}
      <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
        全部记录（{records?.length ?? 0} 条）
      </div>
      {!records || records.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
          <EmptyState title="还没有实验记录" desc="在上面的表单填一条，开始记录你的实验过程" />
        </div>
      ) : (
        <div className="relative pl-5">
          {/* 时间线竖线 */}
          <div className="absolute left-1.5 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="space-y-4">
            {records.map((r) => (
              <div key={r.id} className="relative">
                <span className="absolute -left-5 top-1.5 w-3 h-3 rounded-full bg-brand-500 ring-2 ring-white dark:ring-slate-900" />
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">{r.date}</div>
                      <div className="text-base font-medium text-slate-900 dark:text-slate-100">{r.title}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id!)}
                      className="text-red-600 text-xs"
                    >
                      删除
                    </button>
                  </div>
                  {r.content && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 whitespace-pre-wrap">
                      {r.content}
                    </p>
                  )}
                  {r.indicators.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.indicators.map((n) => (
                        <span
                          key={n}
                          className="px-2 py-0.5 text-[11px] rounded bg-brand-50 text-brand-800 dark:bg-slate-900 dark:text-brand-200"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {r.photos.map((p, i) => (
                        <img
                          key={i}
                          src={p}
                          alt={`${r.title} 照片${i + 1}`}
                          className="w-24 h-24 object-cover rounded-md border border-slate-200 dark:border-slate-700"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}