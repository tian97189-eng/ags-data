import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { computeMLSS } from '../../lib/extras';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import HistoryCalendar from '../../components/common/HistoryCalendar';
import { trashRows } from '../../lib/trash';

/** 污泥浓度（MLSS / MLVSS）录入表
 * 4 个重量（M1~M4）+ 取样体积 V 通常分 3 天测完（过滤烘干 / 干净坩埚 / 灼烧残渣）。
 * 因此：任意字段可选填，按 (date, paperNo) upsert——下次补填自动覆盖同一行。
 * 全部填完后 computeMLSS 算出 MLSS/MLVSS；缺字段时返回 null 不算。
 */
export default function MLSSPage() {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const [paperNo, setPaperNo] = useState('');
  const [m1, setM1] = useState('');
  const [m2, setM2] = useState('');
  const [m3, setM3] = useState('');
  const [m4, setM4] = useState('');
  const [v, setV] = useState('15');

  const rows = useLiveQuery(
    () => db.mlssRecords.orderBy('date').reverse().toArray(),
    [],
  );

  function num(s: string): number | null {
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const previewMLSS = computeMLSS({ m1: num(m1), m2: num(m2), m3: num(m3), m4: num(m4), v: num(v) });

  async function handleUpsert() {
    if (!date) {
      toast('请选日期', 'warning');
      return;
    }
    const pn = paperNo.trim();
    if (!pn) {
      toast('请填滤纸编号', 'warning');
      return;
    }
    const m1v = num(m1), m2v = num(m2), m3v = num(m3), m4v = num(m4), vv = num(v);
    // 任意字段可选填（支持分 3 天测量），但至少要有 1 个重量值才能保存，避免空记录
    const anyFilled = [m1v, m2v, m3v, m4v, vv].some((x) => x != null);
    if (!anyFilled) {
      toast('至少填 1 个重量值再保存', 'warning');
      return;
    }
    // 先查同 (date, paperNo) 是否已有记录（upsert 场景）
    // 注：paperNo 不在 schema 索引里，用 toArray + filter 代替 where('paperNo')
    const allOnDate = await db.mlssRecords.where('date').equals(date).toArray();
    const existing = allOnDate.find((row) => row.paperNo === pn);
    // 计算时优先用输入框值；空字段用 db 已有值（upsert 场景保留已填）
    const merged = {
      m1: m1v ?? existing?.m1 ?? null,
      m2: m2v ?? existing?.m2 ?? null,
      m3: m3v ?? existing?.m3 ?? null,
      m4: m4v ?? existing?.m4 ?? null,
      v: vv ?? existing?.v ?? null,
    };
    const r = computeMLSS(merged);
    if (existing?.id) {
      // 增量更新：只写非空字段（用户没改的保留原值；null/空代表"不改"）
      const patch: Record<string, number | null> = {};
      if (m1v != null) patch.m1 = m1v;
      if (m2v != null) patch.m2 = m2v;
      if (m3v != null) patch.m3 = m3v;
      if (m4v != null) patch.m4 = m4v;
      if (vv != null) patch.v = vv;
      patch.mlss = r.mlss;
      patch.mlvss = r.mlvss;
      await db.mlssRecords.update(existing.id, patch);
      const added = [m1v, m2v, m3v, m4v, vv]
        .map((v, i) => (v != null && [existing.m1, existing.m2, existing.m3, existing.m4, existing.v][i] == null ? ['M1', 'M2', 'M3', 'M4', 'V'][i] : null))
        .filter(Boolean);
      toast(`已补全 ${pn}${added.length ? '（+' + added.join(' +') + '）' : ''}`, 'success');
    } else {
      await db.mlssRecords.add({
        date, reactorId: null, paperNo: pn,
        m1: m1v, m2: m2v, m3: m3v, m4: m4v, v: vv,
        mlss: r.mlss, mlvss: r.mlvss, note: '',
        createdAt: new Date().toISOString(),
      });
      toast(`已保存 ${pn}（${countFilled([m1v, m2v, m3v, m4v, vv])}/5 项，分次补全即可）`, 'success');
    }
    // 清空输入 + 保留 paperNo 让用户继续测剩余字段
    setM1(''); setM2(''); setM3(''); setM4(''); setV('15');
  }

  function countFilled(vals: (number | null)[]): number {
    return vals.filter((x) => x != null).length;
  }

  // 点击历史记录的"补充"按钮 → 把该行已有值加载到输入区，用户接着填缺失字段
  function handleResume(r: { date: string; paperNo: string; m1: number | null; m2: number | null; m3: number | null; m4: number | null; v: number | null }) {
    setDate(r.date);
    setPaperNo(r.paperNo);
    setM1(r.m1 != null ? String(r.m1) : '');
    setM2(r.m2 != null ? String(r.m2) : '');
    setM3(r.m3 != null ? String(r.m3) : '');
    setM4(r.m4 != null ? String(r.m4) : '');
    setV(r.v != null ? String(r.v) : '15');
    toast(`已加载 ${r.paperNo} 现有字段，继续填剩余的即可`, 'info');
    // 滚动到顶部让用户看到输入区
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(id: number) {
    const row = await db.mlssRecords.get(id);
    if (row) await trashRows('mlssRecords', [row]);
    await db.mlssRecords.delete(id);
  }

  // 有数据的日期集合 + 最新日期（日历高亮和默认选中用）
  const dateSet = new Set((rows ?? []).map((r) => r.date));
  const latestDate = (rows ?? [])[0]?.date;

  // 某天的记录（按日期过滤，倒序展示）
  const rowsOf = (date: string) =>
    (rows ?? []).filter((r) => r.date === date);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-1">新增测量</div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          按你给的流程：取 V mL 泥样，过滤烘干后得滤纸+泥（M2）+ 空坩埚（M3）+ 灼烧后坩埚（M4）+ 干净滤纸（M1）。
          MLSS = (M2 − M1) / V；MLVSS = (M2 + M3 − M4) / V。
          <br />
          <span className="text-teal-700 dark:text-teal-400 font-medium">可分次保存</span>：今天测完几项先填上点「保存」（按日期+滤纸编号 upsert），剩下一两天补全剩余字段。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">滤纸编号</span>
            <input value={paperNo} onChange={(e) => setPaperNo(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" placeholder="A-1" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">M1 滤纸重 (g)</span>
            <input type="number" step="any" value={m1} onChange={(e) => setM1(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">M2 滤纸+泥 (g)</span>
            <input type="number" step="any" value={m2} onChange={(e) => setM2(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">M3 干净坩埚 (g)</span>
            <input type="number" step="any" value={m3} onChange={(e) => setM3(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">M4 灼烧残渣+坩埚 (g)</span>
            <input type="number" step="any" value={m4} onChange={(e) => setM4(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">V 取样体积 (mL)</span>
            <input type="number" step="any" value={v} onChange={(e) => setV(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            实时计算：
            MLSS = <span className="font-mono text-teal-700">{previewMLSS.mlss?.toFixed(4) ?? '—'}</span> g/L；
            MLVSS = <span className="font-mono text-teal-700">{previewMLSS.mlvss?.toFixed(4) ?? '—'}</span> g/L
          </div>
          <button type="button" onClick={handleUpsert} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700">
            保存（按日期+编号自动合并）
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-3">历史记录（{rows?.length ?? 0} 条）</div>
        <HistoryCalendar dates={dateSet} defaultDate={latestDate} countLabel={`共 ${rows?.length ?? 0} 条记录`}>
          {(date) => {
            const dayRows = rowsOf(date);
            if (dayRows.length === 0) {
              return (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                  {date} 没有记录
                </div>
              );
            }
            return (
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {date} · {dayRows.length} 条
                </div>
                {/* 桌面（≥md）：原表格；手机：每条记录一张卡，免横滑查看全部字段 */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-xs min-w-[560px]">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">滤纸</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">M1</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">M2</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">M3</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">M4</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-14">V</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">MLSS</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">MLVSS</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-12">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayRows.map((r) => (
                        <tr key={r.id}>
                          <td className="py-1.5 px-2 border-b border-slate-50">{r.paperNo}</td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m1?.toFixed(4) ?? '—'}</td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m2?.toFixed(4) ?? '—'}</td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m3?.toFixed(4) ?? '—'}</td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m4?.toFixed(4) ?? '—'}</td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.v ?? '—'}</td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                            {r.mlss?.toFixed(4) ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                            {r.mlvss?.toFixed(4) ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">
                            <button type="button" onClick={() => handleResume(r)} className="text-teal-600 mr-2">
                              补充
                            </button>
                            <button type="button" onClick={() => handleDelete(r.id!)} className="text-red-600">
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* 手机：每条记录一张卡，按「输入 + 计算结果」分组，全部字段一次看完不横滑 */}
                <div className="md:hidden space-y-2">
                  {dayRows.map((r) => {
                    const filled = countFilled([r.m1, r.m2, r.m3, r.m4, r.v]);
                    const missing = ['M1', 'M2', 'M3', 'M4', 'V'].filter((_, i) => [r.m1, r.m2, r.m3, r.m4, r.v][i] == null);
                    return (
                    <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded-md p-3 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">滤纸 {r.paperNo}</span>
                        <div className="flex gap-3">
                          {filled < 5 && (
                            <button
                              type="button"
                              onClick={() => handleResume(r)}
                              className="text-teal-600 dark:text-teal-400"
                            >
                              补充
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(r.id!)}
                            className="text-red-600"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      {/* 已填字段状态条 */}
                      <div className="flex gap-1 mb-2 text-[10px] text-slate-400 dark:text-slate-500">
                        <span>已填 {filled}/5：</span>
                        {(['M1', 'M2', 'M3', 'M4', 'V'] as const).map((label, i) => {
                          const ok = [r.m1, r.m2, r.m3, r.m4, r.v][i] != null;
                          return (
                            <span key={label} className={ok ? 'text-teal-600 dark:text-teal-400' : 'text-slate-300 dark:text-slate-600'}>
                              {ok ? '✓' : '·'}{label}
                            </span>
                          );
                        })}
                      </div>
                      {missing.length > 0 && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mb-1">
                          待补：{missing.join('、')}
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 tabular-nums">
                        <span className="text-slate-500 dark:text-slate-400">M1</span>
                        <span className="col-span-2 text-right">{r.m1?.toFixed(4) ?? '—'}</span>
                        <span className="text-slate-500 dark:text-slate-400">M2</span>
                        <span className="col-span-2 text-right">{r.m2?.toFixed(4) ?? '—'}</span>
                        <span className="text-slate-500 dark:text-slate-400">M3</span>
                        <span className="col-span-2 text-right">{r.m3?.toFixed(4) ?? '—'}</span>
                        <span className="text-slate-500 dark:text-slate-400">M4</span>
                        <span className="col-span-2 text-right">{r.m4?.toFixed(4) ?? '—'}</span>
                        <span className="text-slate-500 dark:text-slate-400">V (mL)</span>
                        <span className="col-span-2 text-right">{r.v ?? '—'}</span>
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700 grid grid-cols-3 gap-x-2 tabular-nums">
                        <span className="text-slate-500 dark:text-slate-400">MLSS</span>
                        <span className="col-span-2 text-right font-medium text-teal-700">{r.mlss?.toFixed(4) ?? '—'} g/L</span>
                        <span className="text-slate-500 dark:text-slate-400">MLVSS</span>
                        <span className="col-span-2 text-right font-medium text-teal-700">{r.mlvss?.toFixed(4) ?? '—'} g/L</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          }}
        </HistoryCalendar>
      </div>
    </div>
  );
}