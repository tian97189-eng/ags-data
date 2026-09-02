import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { computeMLSS } from '../../lib/extras';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import EmptyState from '../../components/common/EmptyState';

/** 污泥浓度（MLSS / MLVSS）录入表
 * 填入日期、滤纸编号、4 个重量（M1~M4）、取样体积 V → 自动算 MLSS/MLVSS
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

  async function handleAdd() {
    if (!date) {
      toast('请选日期', 'warning');
      return;
    }
    if (!paperNo.trim()) {
      toast('请填滤纸编号', 'warning');
      return;
    }
    const m1v = num(m1), m2v = num(m2), m3v = num(m3), m4v = num(m4), vv = num(v);
    if (m1v == null || m2v == null || m3v == null || m4v == null || vv == null) {
      toast('请填完所有重量和体积', 'warning');
      return;
    }
    const r = computeMLSS({ m1: m1v, m2: m2v, m3: m3v, m4: m4v, v: vv });
    await db.mlssRecords.add({
      date, reactorId: null, paperNo: paperNo.trim(),
      m1: m1v, m2: m2v, m3: m3v, m4: m4v, v: vv,
      mlss: r.mlss, mlvss: r.mlvss, note: '',
      createdAt: new Date().toISOString(),
    });
    toast('已添加', 'success');
    setPaperNo('');
    setM1(''); setM2(''); setM3(''); setM4(''); setV('15');
  }

  async function handleDelete(id: number) {
    await db.mlssRecords.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-1">新增测量</div>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-3">
          按你给的流程：取 V mL 泥样，过滤烘干后得滤纸+泥（M2）+ 空坩埚（M3）+ 灼烧后坩埚（M4）+ 干净滤纸（M1）。
          MLSS = (M2 − M1) / V；MLVSS = (M2 + M3 − M4) / V。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">滤纸编号</span>
            <input value={paperNo} onChange={(e) => setPaperNo(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" placeholder="A-1" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">M1 滤纸重 (g)</span>
            <input type="number" step="any" value={m1} onChange={(e) => setM1(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">M2 滤纸+泥+坩埚 (g)</span>
            <input type="number" step="any" value={m2} onChange={(e) => setM2(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">M3 干净坩埚 (g)</span>
            <input type="number" step="any" value={m3} onChange={(e) => setM3(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">M4 灼烧残渣+坩埚 (g)</span>
            <input type="number" step="any" value={m4} onChange={(e) => setM4(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">V 取样体积 (mL)</span>
            <input type="number" step="any" value={v} onChange={(e) => setV(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500">
            实时计算：
            MLSS = <span className="font-mono text-teal-700">{previewMLSS.mlss?.toFixed(4) ?? '—'}</span> g/L；
            MLVSS = <span className="font-mono text-teal-700">{previewMLSS.mlvss?.toFixed(4) ?? '—'}</span> g/L
          </div>
          <button type="button" onClick={handleAdd} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700">
            添加到记录
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-2">历史记录（{rows?.length ?? 0} 条）</div>
        {!rows || rows.length === 0 ? (
          <EmptyState title="还没有数据" desc="在上面的表单填入数据并点添加" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full table-fixed border-collapse text-xs min-w-[640px]">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-24">日期</th>
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
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 px-2 border-b border-slate-50 whitespace-nowrap">{r.date}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50">{r.paperNo}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m1?.toFixed(4)}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m2?.toFixed(4)}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m3?.toFixed(4)}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.m4?.toFixed(4)}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.v}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {r.mlss?.toFixed(4) ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {r.mlvss?.toFixed(4) ?? '—'}
                    </td>
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
        )}
      </div>
    </div>
  );
}