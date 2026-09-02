import { useState } from 'react';
import type { MethodDoc, MethodReagent, MethodStep } from '../../db/schema';
import { importStepImages } from '../../lib/methods';
import { useAppStore } from '../../store/useAppStore';

const CATEGORIES = ['水质指标', '污泥性状', '表征', '仪器使用', '粒径'];

function emptyDoc(): MethodDoc {
  return {
    name: '',
    method: '',
    category: '水质指标',
    scope: '',
    reagents: [],
    instruments: [],
    steps: [{ text: '' }],
    warnings: [],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * 方法编辑器：新建（doc=null）或编辑现有方法。
 * 支持：试剂表行增删、步骤行增删（每步可配图）、批量导入配图、附件（图片/PDF）。
 */
export default function MethodEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: MethodDoc | null;
  onSave: (doc: MethodDoc) => Promise<void>;
  onCancel: () => void;
}) {
  const toast = useAppStore((s) => s.toast);
  const [doc, setDoc] = useState<MethodDoc>(initial ? JSON.parse(JSON.stringify(initial)) : emptyDoc());
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<MethodDoc>) {
    setDoc((d) => ({ ...d, ...p }));
  }
  function patchReagent(i: number, p: Partial<MethodReagent>) {
    setDoc((d) => {
      const reagents = [...d.reagents];
      reagents[i] = { ...reagents[i], ...p };
      return { ...d, reagents };
    });
  }
  function patchStep(i: number, p: Partial<MethodStep>) {
    setDoc((d) => {
      const steps = d.steps.map((s, idx) => (idx === i ? { ...s, ...p } : s));
      return { ...d, steps };
    });
  }

  async function handleBatchImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const r = await importStepImages(doc, arr);
    if (r.ok > 0) {
      toast(`已给 ${r.ok} 个步骤配上图`, 'success');
      // 强制刷新（doc 已被就地改过，靠 setDoc 新引用触发渲染）
      setDoc((d) => ({ ...d, steps: [...d.steps] }));
    }
    if (r.failed > 0) toast(`${r.failed} 张读取失败`, 'warning');
    if (r.skipped > 0) toast(`${r.skipped} 张因步骤已配满被跳过`, 'info');
  }

  async function handleAttach(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      const kind: 'image' | 'pdf' = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
      const data = await readAsDataURL(f);
      if (data) {
        patch({ attachments: [...doc.attachments, { name: f.name, kind, data }] });
      }
    }
  }

  function readAsDataURL(f: File): Promise<string | null> {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(f);
    });
  }

  async function handleSave() {
    if (!doc.name.trim()) {
      toast('请填写方法名称', 'warning');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const toSave: MethodDoc = {
        ...doc,
        name: doc.name.trim(),
        updatedAt: now,
        createdAt: doc.createdAt || now,
        steps: doc.steps.filter((s) => s.text.trim() || s.image),
        reagents: doc.reagents.filter((r) => r.name.trim()),
        instruments: doc.instruments.filter((i) => i.trim()),
        warnings: doc.warnings.filter((w) => w.trim()),
      };
      await onSave(toSave);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* 基本信息 */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4 space-y-2">
        <div className="text-base font-medium">基本信息</div>
        <div className="grid md:grid-cols-2 gap-2">
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">方法名称 *</span>
            <input
              value={doc.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="如：氨氮测定"
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">副标题</span>
            <input
              value={doc.method}
              onChange={(e) => patch({ method: e.target.value })}
              placeholder="如：纳氏试剂法 420nm"
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
            />
          </label>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => patch({ category: c })}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                doc.category === c
                  ? 'bg-teal-50 border-teal-300 text-teal-800 font-medium dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-200'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-slate-500 dark:text-slate-400 text-xs">适用范围</span>
          <input
            value={doc.scope}
            onChange={(e) => patch({ scope: e.target.value })}
            placeholder="如：进水 / 出水水样；空白 1、进水 1、出水 1"
            className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
          />
        </label>
      </div>

      {/* 试剂与药品 */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-base font-medium">试剂与药品</div>
          <button
            type="button"
            onClick={() => patch({ reagents: [...doc.reagents, { name: '', conc: '', dose: '', note: '' }] })}
            className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
          >
            + 加试剂
          </button>
        </div>
        {doc.reagents.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_90px_1fr_auto] gap-1.5 mb-1.5 items-center">
            <input
              value={r.name}
              onChange={(e) => patchReagent(i, { name: e.target.value })}
              placeholder="试剂名"
              className="border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-900"
            />
            <input
              value={r.conc}
              onChange={(e) => patchReagent(i, { conc: e.target.value })}
              placeholder="浓度"
              className="border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-900"
            />
            <input
              value={r.dose}
              onChange={(e) => patchReagent(i, { dose: e.target.value })}
              placeholder="用量"
              className="border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-900"
            />
            <input
              value={r.note}
              onChange={(e) => patchReagent(i, { note: e.target.value })}
              placeholder="备注"
              className="border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={() => patch({ reagents: doc.reagents.filter((_, idx) => idx !== i) })}
              className="text-red-500 text-xs px-1"
              aria-label="删除试剂"
            >
              ✕
            </button>
          </div>
        ))}
        {doc.reagents.length === 0 && (
          <div className="text-xs text-slate-400 dark:text-slate-500">还没有试剂，点右上角「+ 加试剂」</div>
        )}
      </div>

      {/* 操作步骤（可配图） */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-base font-medium">操作步骤（可配图）</div>
          <div className="flex gap-2">
            <label className="px-2 py-1 text-xs rounded border border-dashed border-teal-400 text-teal-700 dark:text-teal-300 cursor-pointer">
              ⇪ 批量导入配图
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleBatchImages(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => patch({ steps: [...doc.steps, { text: '' }] })}
              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
            >
              + 加步骤
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
          批量导入的图片按选择顺序依次挂到还没有配图的步骤上（第 1 张 → 第 1 步）。
        </p>
        {doc.steps.map((s, i) => (
          <div key={i} className="mb-3 border border-slate-100 dark:border-slate-700 rounded-lg p-2">
            <div className="flex gap-2 items-start">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[11px] flex items-center justify-center mt-1 shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <textarea
                  value={s.text}
                  onChange={(e) => patchStep(i, { text: e.target.value })}
                  placeholder={`第 ${i + 1} 步操作…`}
                  rows={Math.max(1, Math.ceil(s.text.length / 40))}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white dark:bg-slate-900 resize-y"
                />
                {s.image && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <img
                      src={s.image}
                      alt={`步骤${i + 1}配图`}
                      className="w-20 h-20 object-cover rounded border border-slate-200 dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => patchStep(i, { image: undefined })}
                      className="text-xs text-red-500"
                    >
                      移除
                    </button>
                  </div>
                )}
                <label className="inline-block mt-1.5 text-xs text-teal-700 dark:text-teal-300 cursor-pointer">
                  {s.image ? '换图' : '+ 上传配图'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const { compressImage } = await import('../../lib/methods');
                        const data = await compressImage(f);
                        if (data) patchStep(i, { image: data });
                        else toast('图片读取失败', 'error');
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => patch({ steps: doc.steps.filter((_, idx) => idx !== i) })}
                className="text-red-500 text-xs px-1 mt-1"
                aria-label="删除步骤"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 仪器 + 注意事项 + 附件 */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-medium">仪器设备</span>
            <button
              type="button"
              onClick={() => patch({ instruments: [...doc.instruments, ''] })}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
            >
              + 加仪器
            </button>
          </div>
          {doc.instruments.map((ins, i) => (
            <div key={i} className="flex gap-1.5 mb-1">
              <input
                value={ins}
                onChange={(e) => {
                  const instruments = [...doc.instruments];
                  instruments[i] = e.target.value;
                  patch({ instruments });
                }}
                placeholder="如：分光光度计（420nm）"
                className="flex-1 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => patch({ instruments: doc.instruments.filter((_, idx) => idx !== i) })}
                className="text-red-500 text-xs px-1"
                aria-label="删除仪器"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-medium">注意事项</span>
            <button
              type="button"
              onClick={() => patch({ warnings: [...doc.warnings, ''] })}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
            >
              + 加注意
            </button>
          </div>
          {doc.warnings.map((w, i) => (
            <div key={i} className="flex gap-1.5 mb-1">
              <input
                value={w}
                onChange={(e) => {
                  const warnings = [...doc.warnings];
                  warnings[i] = e.target.value;
                  patch({ warnings });
                }}
                placeholder="如：碘不用空白"
                className="flex-1 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => patch({ warnings: doc.warnings.filter((_, idx) => idx !== i) })}
                className="text-red-500 text-xs px-1"
                aria-label="删除注意"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-medium">附件（图片 / PDF）</span>
            <label className="px-2 py-0.5 text-xs rounded border border-dashed border-teal-400 text-teal-700 dark:text-teal-300 cursor-pointer">
              + 上传附件
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleAttach(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {doc.attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {doc.attachments.map((a, i) => (
                <div
                  key={i}
                  className="relative w-16 h-16 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden group"
                >
                  {a.kind === 'image' ? (
                    <img src={a.data} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-red-50 dark:bg-red-900/30 text-red-500 text-[10px] font-medium">
                      PDF
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => patch({ attachments: doc.attachments.filter((_, idx) => idx !== i) })}
                    className="absolute top-0 right-0 bg-black/60 text-white text-[10px] w-4 h-4 rounded-bl hidden group-hover:flex items-center justify-center"
                    aria-label="删除附件"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 dark:text-slate-500">还没有附件（图片 / PDF）</div>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 pb-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {saving ? '保存中…' : initial ? '保存修改' : '创建方法'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300"
        >
          取消
        </button>
      </div>
    </div>
  );
}
