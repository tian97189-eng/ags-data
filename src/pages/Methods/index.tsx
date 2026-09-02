import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { MethodDoc } from '../../db/schema';
import { seedMethodsIfEmpty, countMedia } from '../../lib/methods';
import { gotoEntry } from '../../lib/navBus';
import { useAppStore } from '../../store/useAppStore';
import EmptyState from '../../components/common/EmptyState';
import Lightbox from '../../components/common/Lightbox';
import MethodEditor from './editor';

const CATEGORY_ORDER = ['水质指标', '污泥性状', '粒径', '表征', '仪器使用', '其他'];

type View =
  | { mode: 'list' }
  | { mode: 'detail'; id: number }
  | { mode: 'edit'; id: number | null };

/**
 * 实验方法库：列表（按分类分组）+ 详情（5 块结构 + 列表/逐步切换）+ 编辑。
 * 作为「其他指标」页的一个 tab 使用；也可通过 focusName 直接打开某个方法。
 */
export default function MethodsTab({ focusName }: { focusName?: string }) {
  const toast = useAppStore((s) => s.toast);
  const docs = useLiveQuery(() => db.methodDocs.orderBy('updatedAt').reverse().toArray(), []);

  const [view, setView] = useState<View>({ mode: 'list' });

  // 首次进入：预置 11 个骨架
  useEffect(() => {
    void seedMethodsIfEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部指定打开某个方法（如粒径页跳转）
  const focusedId = useMemo(() => {
    if (!focusName || !docs) return null;
    const hit = docs.find((d) => d.name.includes(focusName));
    return hit?.id ?? null;
  }, [focusName, docs]);

  useEffect(() => {
    if (focusedId != null) {
      setView({ mode: 'detail', id: focusedId });
    }
  }, [focusedId]);

  if (view.mode === 'edit') {
    const doc = view.id != null ? docs?.find((d) => d.id === view.id) ?? null : null;
    return (
      <MethodEditor
        initial={doc as MethodDoc | null}
        onCancel={() => setView(view.id == null ? { mode: 'list' } : { mode: 'detail', id: view.id })}
        onSave={async (d) => {
          if (d.id != null) {
            await db.methodDocs.put(d);
            toast('已保存修改', 'success');
            setView({ mode: 'detail', id: d.id });
          } else {
            const id = await db.methodDocs.add({ ...d, createdAt: new Date().toISOString() });
            toast('方法已创建', 'success');
            setView({ mode: 'detail', id });
          }
        }}
      />
    );
  }

  if (view.mode === 'detail') {
    const doc = docs?.find((d) => d.id === view.id);
    if (doc) {
      return (
        <MethodDetail
          doc={doc}
          onBack={() => setView({ mode: 'list' })}
          onEdit={() => setView({ mode: 'edit', id: doc.id! })}
          onDelete={async () => {
            await db.methodDocs.delete(doc.id!);
            toast('方法已删除', 'info');
            setView({ mode: 'list' });
          }}
        />
      );
    }
  }

  // —— 列表 ——
  return (
    <MethodListView
      docs={docs}
      onOpen={(id) => setView({ mode: 'detail', id })}
      onNew={() => setView({ mode: 'edit', id: null })}
    />
  );
}

function MethodListView({
  docs,
  onOpen,
  onNew,
}: {
  docs: MethodDoc[] | undefined;
  onOpen: (id: number) => void;
  onNew: () => void;
}) {
  const grouped = useMemo(() => {
    if (!docs) return [];
    const map = new Map<string, MethodDoc[]>();
    for (const d of docs) {
      const cat = CATEGORY_ORDER.includes(d.category) ? d.category : '其他';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(d);
    }
    const order = [...CATEGORY_ORDER].sort((a, b) => {
      const na = map.get(a)?.length ?? 0;
      const nb = map.get(b)?.length ?? 0;
      return nb - na;
    });
    return order.filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [docs]);

  if (docs == null) return <div className="text-xs text-slate-400 p-4">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {docs.length} 个实验方法 · 含试剂 / 步骤 / 配图 / PDF
        </div>
        <button
          type="button"
          onClick={onNew}
          className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700"
        >
          + 新增方法
        </button>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          title="还没有实验方法"
          desc="点右上角「+ 新增方法」创建第一个，或刷新后自动预置 11 个常用方法"
        />
      ) : (
        grouped.map(([cat, list]) => (
          <section key={cat}>
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-2 font-medium">
              {cat} · {list.length}
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {list.map((d) => {
                const media = countMedia(d);
                const imgCount = media.stepImages + media.images;
                const pdfCount = media.pdfs;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onOpen(d.id!)}
                    className="text-left bg-white dark:bg-slate-800 rounded-lg shadow-card p-3 hover:shadow-md transition-shadow"
                  >
                    <div className="text-[15px] font-medium text-slate-900 dark:text-slate-100">
                      {d.name}
                    </div>
                    <div className="text-xs text-teal-700 dark:text-teal-300 mt-0.5">
                      {d.method}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                      <span>{d.steps.length} 步</span>
                      {imgCount > 0 && <span>图 {imgCount}</span>}
                      {pdfCount > 0 && <span>PDF {pdfCount}</span>}
                      {imgCount === 0 && pdfCount === 0 && <span>暂无配图</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** 方法详情：5 块结构 + 列表/逐步切换 */
function MethodDetail({
  doc,
  onBack,
  onEdit,
  onDelete,
}: {
  doc: MethodDoc;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [stepMode, setStepMode] = useState(false);
  const [cur, setCur] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const media = countMedia(doc);
  const step = stepMode ? doc.steps[cur] : null;
  const stepReagents = step?.reagentRefs
    ?.map((i) => doc.reagents[i])
    .filter((r): r is NonNullable<typeof r> => !!r) ?? [];

  return (
    <div className="space-y-3 pb-4">
      {/* 头部 */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onBack}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 text-sm"
                aria-label="返回"
              >
                ←
              </button>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">{doc.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200">
                {doc.category}
              </span>
            </div>
            {doc.method && (
              <div className="text-sm text-teal-700 dark:text-teal-300 mt-0.5 ml-6">{doc.method}</div>
            )}
            {doc.scope && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-6">适用：{doc.scope}</div>
            )}
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 ml-6">
              更新于 {doc.updatedAt?.slice(0, 10) || '—'} · {doc.steps.length} 步 ·{' '}
              {media.stepImages} 张步骤图 · {media.images + media.pdfs} 个附件
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => gotoEntry()}
              className="px-2.5 py-1 text-xs rounded bg-teal-600 text-white hover:bg-teal-700"
              title="回到数据录入页记录数据"
            >
              去录入
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
            >
              编辑
            </button>
            {confirmDel ? (
              <button
                type="button"
                onClick={onDelete}
                className="px-2.5 py-1 text-xs rounded bg-red-500 text-white"
              >
                确认删除
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="px-2.5 py-1 text-xs rounded border border-red-200 text-red-600 dark:border-red-800"
              >
                删除
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 逐步模式切换 */}
      {doc.steps.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStepMode(false)}
            className={`px-3 py-1 rounded-full text-xs border ${
              !stepMode
                ? 'bg-teal-600 text-white border-teal-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            完整列表
          </button>
          <button
            type="button"
            onClick={() => {
              setStepMode(true);
              setCur(0);
            }}
            className={`px-3 py-1 rounded-full text-xs border ${
              stepMode
                ? 'bg-teal-600 text-white border-teal-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            逐步模式
          </button>
        </div>
      )}

      {/* 试剂（完整模式顶部表） */}
      {!stepMode && doc.reagents.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
          <div className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2">🧪 试剂与药品</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500">
                <th className="text-left py-1 pr-2 font-normal">试剂</th>
                <th className="text-left py-1 pr-2 font-normal w-24">浓度</th>
                <th className="text-left py-1 pr-2 font-normal w-24">用量</th>
                <th className="text-left py-1 font-normal">备注</th>
              </tr>
            </thead>
            <tbody>
              {doc.reagents.map((r, i) => (
                <tr key={i} className="text-slate-700 dark:text-slate-300">
                  <td className="py-1.5 pr-2">{r.name}</td>
                  <td className="py-1.5 pr-2">{r.conc || '—'}</td>
                  <td className="py-1.5 pr-2">{r.dose || '—'}</td>
                  <td className="py-1.5 text-slate-500 dark:text-slate-400">{r.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 步骤：完整列表 */}
      {!stepMode ? (
        doc.steps.length > 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
            <div className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2">📋 操作步骤</div>
            {doc.steps.map((s, i) => {
              const refs =
                s.reagentRefs?.map((ri) => doc.reagents[ri]).filter((r) => !!r) ?? [];
              return (
                <div key={i} className="flex gap-3 mb-3 last:mb-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                      i === 0
                        ? 'bg-teal-600 text-white'
                        : 'bg-teal-50 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {s.text}
                    </div>
                    {s.image && (
                      <button
                        type="button"
                        onClick={() => setLightbox(s.image!)}
                        className="mt-2 block"
                        aria-label={`查看第${i + 1}步配图`}
                      >
                        <img
                          src={s.image}
                          alt={`第${i + 1}步配图`}
                          className="max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 cursor-zoom-in"
                        />
                      </button>
                    )}
                    {refs.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {refs.map((r, ri) => (
                          <span
                            key={ri}
                            className="text-[11px] px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                          >
                            {r.name}
                            {r.dose ? ` ${r.dose}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="还没有步骤" desc="点编辑，添加操作步骤" />
        )
      ) : (
        /* 逐步模式：一次一步，大字号 + 本步试剂 */
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-5 text-center">
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">
            步骤 {cur + 1} / {doc.steps.length}
          </div>
          <div className="w-9 h-9 mx-auto rounded-full bg-teal-600 text-white flex items-center justify-center font-medium mb-4">
            {cur + 1}
          </div>
          <div className="text-lg md:text-xl leading-relaxed text-slate-900 dark:text-slate-100 font-light whitespace-pre-wrap">
            {doc.steps[cur]?.text}
          </div>
          {doc.steps[cur]?.image && (
            <button
              type="button"
              onClick={() => setLightbox(doc.steps[cur]!.image!)}
              className="mt-3 block mx-auto"
              aria-label="查看本步配图"
            >
              <img
                src={doc.steps[cur]!.image}
                alt={`步骤${cur + 1}配图`}
                className="max-h-56 rounded-lg border border-slate-200 dark:border-slate-700 cursor-zoom-in mx-auto"
              />
            </button>
          )}
          {stepReagents.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1.5">本步用到的试剂</div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {stepReagents.map((r, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                  >
                    {r.name} {r.dose || r.conc || ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => setCur((c) => Math.max(0, c - 1))}
              disabled={cur === 0}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-30"
            >
              上一步
            </button>
            {cur < doc.steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setCur((c) => Math.min(doc.steps.length - 1, c + 1))}
                className="px-6 py-2 rounded-lg bg-teal-600 text-white text-sm"
              >
                下一步
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepMode(false)}
                className="px-6 py-2 rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm"
              >
                完成 ✓
              </button>
            )}
          </div>
        </div>
      )}

      {/* 仪器 */}
      {doc.instruments.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
          <div className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2">🔧 仪器设备</div>
          <div className="flex flex-wrap gap-1.5">
            {doc.instruments.map((ins, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              >
                {ins}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 注意事项 */}
      {doc.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div className="text-[13px] font-medium text-amber-800 dark:text-amber-200 mb-1.5">⚠️ 注意事项</div>
          <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
            {doc.warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 附件区 */}
      {doc.attachments.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
          <div className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2">
            📎 附件（{doc.attachments.length}）
          </div>
          <div className="flex flex-wrap gap-2">
            {doc.attachments.map((a, i) =>
              a.kind === 'image' ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(a.data)}
                  className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700"
                  aria-label={`查看附件 ${a.name}`}
                >
                  <img src={a.data} alt={a.name} className="w-full h-full object-cover" />
                </button>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPdfPreview(a.data)}
                  className="w-40 h-20 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 flex flex-col items-center justify-center gap-1"
                >
                  <span className="text-[10px] font-bold text-red-500">PDF</span>
                  <span className="text-[10px] text-red-600 dark:text-red-300 px-1 truncate max-w-full">
                    {a.name}
                  </span>
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {/* 图片 lightbox */}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}

      {/* PDF 预览 */}
      {pdfPreview && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex flex-col"
          onClick={() => setPdfPreview(null)}
        >
          <div className="flex items-center justify-between p-2 text-white">
            <span className="text-xs">PDF 预览 · 点空白处关闭</span>
            <a
              href={pdfPreview}
              download="method.pdf"
              onClick={(e) => e.stopPropagation()}
              className="px-3 py-1 bg-teal-600 rounded text-xs"
            >
              下载
            </a>
          </div>
          <iframe
            src={pdfPreview}
            title="PDF 预览"
            className="flex-1 w-full bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
