import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { computeMLSS } from '../../lib/extras';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import HistoryCalendar from '../../components/common/HistoryCalendar';
import { trashRows } from '../../lib/trash';

/** 平行样槽位数：一个反应器每天 3 张滤纸（取均值） */
const SLOT_COUNT = 3;

/** 串行写入队列：保证连续输入按序落库，避免 upsert 竞态 */
let writeChain: Promise<void> = Promise.resolve();

/** 求一组非空数值的均值；全空返回 null */
function meanOf(vals: (number | null)[]): number | null {
  const ok = vals.filter((x): x is number => x != null && Number.isFinite(x));
  if (ok.length === 0) return null;
  return ok.reduce((s, x) => s + x, 0) / ok.length;
}

type FieldKey = 'm1' | 'm2' | 'm3' | 'm4' | 'v';
const FIELD_LABEL: Record<FieldKey, string> = {
  m1: 'M1 滤纸重 (g)',
  m2: 'M2 滤纸+泥 (g)',
  m3: 'M3 干净坩埚 (g)',
  m4: 'M4 灼烧残渣+坩埚 (g)',
  v: 'V 取样体积 (mL)',
};

/**
 * 污泥浓度（MLSS / MLVSS）录入（反应器 × 3 张滤纸平行样）
 * 一个反应器一天做 3 张滤纸 → 各自算 MLSS → 取均值作为该反应器当日结果。
 * 每张滤纸 = (date, reactorId, slot) 一行；任意字段可分次保存（upsert），
 * 与「3 天测完 M1~M4」的流程兼容；均值在有值的张数 ≥1 时即显示。
 */
export default function MLSSPage() {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const [reactorId, setReactorId] = useState<number | null>(null);

  const reactors = useLiveQuery(
    async () => {
      const all = await db.reactors.toArray();
      return all.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [],
  );
  const rows = useLiveQuery(
    () => db.mlssRecords.orderBy('date').reverse().toArray(),
    [],
  );

  // 默认选中第一个激活反应器（数据加载完成后；避免每渲染重置用户选择）
  useEffect(() => {
    if (reactorId == null && reactors && reactors.length > 0) {
      setReactorId(reactors[0].id!);
    }
  }, [reactors, reactorId]);

  const reactor = (reactors ?? []).find((r) => r.id === reactorId) ?? null;
  const reactorCode = reactor?.code ?? 'R?';

  // 当天该反应器的 3 张滤纸记录（slot 1..3）
  const dayRows = (rows ?? []).filter((r) => r.date === date);
  const recOf = (slot: number) =>
    dayRows.find((r) => r.reactorId === reactorId && (r.slot ?? null) === slot);

  // 各张纸自身算出的 MLSS/MLVSS + 组均值
  const perSlot = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map((slot) => {
    const rec = recOf(slot);
    const r = computeMLSS({
      m1: rec?.m1 ?? null,
      m2: rec?.m2 ?? null,
      m3: rec?.m3 ?? null,
      m4: rec?.m4 ?? null,
      v: rec?.v ?? null,
    });
    return { slot, rec, mlss: r.mlss, mlvss: r.mlvss };
  });
  const meanMLSS = meanOf(perSlot.map((p) => p.mlss));
  const meanMLVSS = meanOf(perSlot.map((p) => p.mlvss));

  /** 输入即保存（upsert by date+reactor+slot）。field 值 raw='' 表示清空。
   * 用串行链保证连续输入不产生同 key 竞态（否则快速连续 change 会重复 add） */
  async function handleField(slot: number, field: FieldKey, raw: string) {
    if (!reactorId || !reactor) return;
    const trimmed = raw.trim();
    const val = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && !Number.isFinite(val)) return; // 非法输入忽略

    // 串行写入队列
    writeChain = writeChain.then(async () => {
      const cur = (await db.mlssRecords
        .where('date').equals(date).toArray())
        .find((r) => r.reactorId === reactorId && (r.slot ?? null) === slot);
      const merged: Record<FieldKey, number | null> = {
        m1: field === 'm1' ? val : (cur?.m1 ?? null),
        m2: field === 'm2' ? val : (cur?.m2 ?? null),
        m3: field === 'm3' ? val : (cur?.m3 ?? null),
        m4: field === 'm4' ? val : (cur?.m4 ?? null),
        v: field === 'v' ? val : (cur?.v ?? null),
      };
      const filled = Object.values(merged).some((x) => x != null);
      const r = computeMLSS(merged);

      if (cur?.id) {
        if (!filled) {
          await trashRows('mlssRecords', [cur]);
          await db.mlssRecords.delete(cur.id);
        } else {
          await db.mlssRecords.update(cur.id, { ...merged, mlss: r.mlss, mlvss: r.mlvss });
        }
        return;
      }
      if (filled) {
        await db.mlssRecords.add({
          date,
          reactorId,
          slot,
          paperNo: `${reactorCode}-${slot}`,
          m1: merged.m1, m2: merged.m2, m3: merged.m3, m4: merged.m4, v: merged.v,
          mlss: r.mlss, mlvss: r.mlvss,
          note: '',
          createdAt: new Date().toISOString(),
        });
      }
    });
    await writeChain;
  }

  async function handleDelete(id: number) {
    const row = await db.mlssRecords.get(id);
    if (row) await trashRows('mlssRecords', [row]);
    await db.mlssRecords.delete(id);
    toast('记录已删除（可到回收站恢复）', 'success');
  }

  // ===== 历史：按「反应器 + 该反应器的 3 张纸」分组展示（兼容旧自由编号记录）=====
  const dateSet = new Set((rows ?? []).map((r) => r.date));
  const latestDate = (rows ?? [])[0]?.date;
  const rowsOf = (d: string) => (rows ?? []).filter((r) => r.date === d);

  /** 把当日记录按 (reactorId + slot 组) 分组；旧记录（reactorId null）每组单行 */
  interface Group {
    key: string;
    label: string;
    reactorCode: string | null;
    entries: typeof rows[number][];
    meanMLSS: number | null;
    meanMLVSS: number | null;
  }
  function buildGroups(d: string): Group[] {
    const recs = rowsOf(d);
    const by = new Map<string, Group>();
    for (const rec of recs) {
      const hasSlot = rec.reactorId != null && rec.slot != null;
      const code = reactors?.find((rr) => rr.id === rec.reactorId)?.code ?? (rec.paperNo || '旧记录');
      const key = hasSlot ? `r${rec.reactorId}-s${rec.slot}` : `legacy-${rec.paperNo}-${rec.id}`;
      const groupKey = hasSlot ? `g${rec.reactorId}` : `lg-${rec.id}`;
      if (!by.has(groupKey)) {
        const r = computeMLSS({ m1: rec.m1 ?? null, m2: rec.m2 ?? null, m3: rec.m3 ?? null, m4: rec.m4 ?? null, v: rec.v ?? null });
        by.set(groupKey, {
          key: groupKey,
          label: hasSlot ? code : `${code}（旧）`,
          reactorCode: hasSlot ? code : null,
          entries: [],
          meanMLSS: r.mlss,
          meanMLVSS: r.mlvss,
        });
      }
      const g = by.get(groupKey)!;
      g.entries.push(rec);
      if (hasSlot) {
        const mls = rec.mlss ?? null;
        const mlv = rec.mlvss ?? null;
        g.meanMLSS = meanOf(g.entries.filter((e) => e.slot != null).map((e) => e.mlss ?? null));
        g.meanMLVSS = meanOf(g.entries.filter((e) => e.slot != null).map((e) => e.mlvss ?? null));
        void mls; void mlv;
      }
    }
    return Array.from(by.values());
  }

  return (
    <div className="space-y-4">
      {/* ========== 新增测量 ========== */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-1">新增测量（一个反应器 3 张滤纸取均值）</div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          每个反应器当天用 3 张滤纸平行测 3 份，软件自动取均值作为该反应器当日 MLSS。
          每张滤纸的 4 个重量可分 3 天测完：今天填滤纸与烘干重，明天补坩埚，后天补灼烧——先填先存，空了再补。
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            日期
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs"
            />
          </label>
          <span className="text-xs text-slate-500 dark:text-slate-400">反应器</span>
          {(reactors ?? []).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReactorId(r.id!)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                reactorId === r.id
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'
              }`}
            >
              {r.code}
            </button>
          ))}
        </div>

        {/* 三张滤纸卡 */}
        <div className="space-y-3">
          {Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map((slot) => {
            const p = perSlot[slot - 1];
            const rec = p.rec;
            const filledCount = [rec?.m1, rec?.m2, rec?.m3, rec?.m4, rec?.v].filter((x) => x != null).length;
            return (
              <div
                key={slot}
                className="border border-slate-200 dark:border-slate-700 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {reactorCode}-{slot} 滤纸
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                      filledCount >= 5
                        ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                        : filledCount > 0
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-slate-50 text-slate-400 dark:bg-slate-700/50 dark:text-slate-500'
                    }`}>
                      {filledCount >= 5 ? '已完成' : `已填 ${filledCount}/5`}
                    </span>
                  </div>
                  {filledCount > 0 && (
                    <span className="text-[11px] text-teal-700 dark:text-teal-300 font-mono">
                      本张 MLSS {p.mlss?.toFixed(4) ?? '—'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {(Object.keys(FIELD_LABEL) as FieldKey[]).map((f) => (
                    <label key={f} className="block">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{FIELD_LABEL[f]}</span>
                      <input
                        type="number"
                        step="any"
                        aria-label={`${reactorCode} 滤纸${slot} ${FIELD_LABEL[f]}`}
                        className="mt-0.5 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs"
                        value={rec?.[f] ?? ''}
                        onChange={(e) => handleField(slot, f, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                {filledCount > 0 && filledCount < 5 && (
                  <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    待补：{(Object.keys(FIELD_LABEL) as FieldKey[])
                      .filter((f) => rec?.[f] == null)
                      .map((f) => FIELD_LABEL[f].split(' ')[0])
                      .join('、')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 均值卡 */}
        <div className="mt-3 rounded-lg bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-slate-800 dark:to-slate-800 border border-teal-100 dark:border-slate-700 p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs text-teal-800 dark:text-teal-300 mb-0.5">
                {reactorCode} · {date} 三滤纸均值（已填 {perSlot.filter((p) => p.mlss != null).length}/3）
              </div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                MLSS = <span className="font-mono text-teal-700 dark:text-teal-300">{meanMLSS?.toFixed(4) ?? '—'} g/L</span>
                <span className="ml-3">MLVSS = <span className="font-mono text-teal-700 dark:text-teal-300">{meanMLVSS?.toFixed(4) ?? '—'} g/L</span></span>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-5">
              {perSlot.map((p, i) => (
                <div key={i}>
                  滤纸{i + 1}: <span className="font-mono">{p.mlss?.toFixed(4) ?? '—'} g/L</span>
                  {p.rec ? (p.rec.mlvss != null ? '' : '') : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ========== 历史记录 ========== */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-3">历史记录（{rows?.length ?? 0} 条）</div>
        <HistoryCalendar dates={dateSet} defaultDate={latestDate} countLabel={`共 ${rows?.length ?? 0} 条记录`}>
          {(d) => {
            const groups = buildGroups(d);
            if (groups.length === 0) {
              return (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                  {d} 没有记录
                </div>
              );
            }
            return (
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {d} · {groups.length} 组 · {rowsOf(d).length} 张滤纸
                </div>
                <div className="space-y-3">
                  {groups.map((g) => (
                    <div key={g.key} className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                      {/* 组头 = 反应器均值 */}
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/40 text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{g.label}</span>
                        {g.reactorCode && (
                          <span className="text-teal-700 dark:text-teal-300 font-mono">
                            均值 MLSS {g.meanMLSS?.toFixed(4) ?? '—'} g/L{meanMLVSS ? ` · MLVSS ${g.meanMLVSS?.toFixed(4) ?? '—'}` : ''}
                          </span>
                        )}
                      </div>
                      {/* 桌面表格 */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full table-fixed border-collapse text-xs">
                          <thead>
                            <tr className="text-slate-500 dark:text-slate-400">
                              <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-24">滤纸</th>
                              <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">M1</th>
                              <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">M2</th>
                              <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">M3</th>
                              <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">M4</th>
                              <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-14">V</th>
                              <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">MLSS</th>
                              <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">MLVSS</th>
                              <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.entries.map((r) => (
                              <tr key={r.id}>
                                <td className="py-1.5 px-2 border-b border-slate-50">{r.paperNo || '—'}</td>
                                <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m1?.toFixed(4) ?? '—'}</td>
                                <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m2?.toFixed(4) ?? '—'}</td>
                                <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m3?.toFixed(4) ?? '—'}</td>
                                <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m4?.toFixed(4) ?? '—'}</td>
                                <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.v ?? '—'}</td>
                                <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">{r.mlss?.toFixed(4) ?? '—'}</td>
                                <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">{r.mlvss?.toFixed(4) ?? '—'}</td>
                                <td className="py-1.5 px-2 border-b border-slate-50 text-right">
                                  <button type="button" onClick={() => handleDelete(r.id!)} className="text-red-600">
                                    删除
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* 手机卡片 */}
                      <div className="md:hidden space-y-2 p-2">
                        {g.entries.map((r) => (
                          <div key={r.id} className="border border-slate-100 dark:border-slate-700 rounded p-2 text-xs">
                            <div className="flex justify-between mb-1">
                              <span className="font-medium">{r.paperNo || '旧记录'}</span>
                              <button type="button" onClick={() => handleDelete(r.id!)} className="text-red-600">
                                删除
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-x-2 text-[11px]">
                              <span className="text-slate-400">M1 {r.m1?.toFixed(4) ?? '—'}</span>
                              <span className="text-slate-400">M2 {r.m2?.toFixed(4) ?? '—'}</span>
                              <span className="text-slate-400">M3 {r.m3?.toFixed(4) ?? '—'}</span>
                              <span className="text-slate-400">M4 {r.m4?.toFixed(4) ?? '—'}</span>
                              <span className="text-slate-400">V {r.v ?? '—'}</span>
                              <span className="text-teal-700">MLSS {r.mlss?.toFixed(4) ?? '—'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        </HistoryCalendar>
      </div>
    </div>
  );
}
