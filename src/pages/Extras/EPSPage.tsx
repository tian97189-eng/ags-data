import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { computeEPS } from '../../lib/extras';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import EmptyState from '../../components/common/EmptyState';

/** EPS 胞外聚合物（PS 多糖 / PN 蛋白质）
 * 用户填：日期、样品编号、VSS 质量、PS 浓度、PN 浓度、提取液体积
 * 自动算：PS 含量 = PS 浓度 × 体积 / VSS（mg/g VSS）
 *         PN 含量 = PN 浓度 × 体积 / VSS
 *         PN/PS 比 = PN 含量 / PS 含量
 */
export default function EPSPage() {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const [sampleCode, setSampleCode] = useState('');
  const [vssMg, setVssMg] = useState('');
  const [psConc, setPsConc] = useState('');
  const [pnConc, setPnConc] = useState('');
  const [extractVolume, setExtractVolume] = useState('');

  const rows = useLiveQuery(
    () => db.epsRecords.orderBy('date').reverse().toArray(),
    [],
  );

  function num(s: string): number | null {
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const preview = computeEPS({
    vssMg: num(vssMg),
    psConc: num(psConc),
    pnConc: num(pnConc),
    extractVolume: num(extractVolume),
  });

  async function handleAdd() {
    if (!date || !sampleCode.trim()) {
      toast('请填日期和样品编号', 'warning');
      return;
    }
    const vss = num(vssMg), ps = num(psConc), pn = num(pnConc), vol = num(extractVolume);
    if (vss == null || ps == null || pn == null || vol == null) {
      toast('请填完所有数值', 'warning');
      return;
    }
    const r = computeEPS({ vssMg: vss, psConc: ps, pnConc: pn, extractVolume: vol });
    await db.epsRecords.add({
      date, reactorId: null, sampleCode: sampleCode.trim(),
      vssMg: vss, psConc: ps, pnConc: pn, extractVolume: vol,
      psContent: r.psContent, pnContent: r.pnContent, pnPsRatio: r.pnPsRatio,
      note: '', createdAt: new Date().toISOString(),
    });
    toast('已添加', 'success');
    setSampleCode(''); setVssMg(''); setPsConc(''); setPnConc(''); setExtractVolume('');
  }

  async function handleDelete(id: number) {
    await db.epsRecords.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">新增 EPS 测量</div>
        <p className="text-xs text-slate-500 mb-3">
          EPS（胞外聚合物）由蛋白质（PN）和多糖（PS）构成。提取后分别测 PN / PS 浓度，结合 VSS 算出每克污泥的含量。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
          <label className="block">
            <span className="text-slate-500 text-xs">日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">样品编号</span>
            <input value={sampleCode} onChange={(e) => setSampleCode(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" placeholder="R1-D1" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">VSS 质量 (mg)</span>
            <input type="number" step="any" value={vssMg} onChange={(e) => setVssMg(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">PS 浓度 (mg/L)</span>
            <input type="number" step="any" value={psConc} onChange={(e) => setPsConc(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">PN 浓度 (mg/L)</span>
            <input type="number" step="any" value={pnConc} onChange={(e) => setPnConc(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">提取液体积 (mL)</span>
            <input type="number" step="any" value={extractVolume} onChange={(e) => setExtractVolume(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600">
            实时计算：
            PS 含量 = <span className="font-mono text-teal-700">{preview.psContent?.toFixed(4) ?? '—'}</span> mg/g VSS；
            PN 含量 = <span className="font-mono text-teal-700">{preview.pnContent?.toFixed(4) ?? '—'}</span> mg/g VSS；
            PN/PS = <span className="font-mono text-teal-700">{preview.pnPsRatio?.toFixed(2) ?? '—'}</span>
          </div>
          <button type="button" onClick={handleAdd} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700">
            添加到记录
          </button>
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-2">历史记录（{rows?.length ?? 0} 条）</div>
        {!rows || rows.length === 0 ? (
          <EmptyState title="还没有数据" desc="在上面的表单填入数据并点添加" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full table-fixed border-collapse text-xs min-w-[640px]">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 w-24">日期</th>
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 w-20">样品</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">VSS</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">PS 浓</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">PN 浓</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">体积</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-20">PS 含量</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-20">PN 含量</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">PN/PS</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-12">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 px-2 border-b border-slate-50 whitespace-nowrap">{r.date}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50">{r.sampleCode}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.vssMg}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.psConc}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.pnConc}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.extractVolume}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {r.psContent?.toFixed(3) ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {r.pnContent?.toFixed(3) ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.pnPsRatio?.toFixed(2) ?? '—'}</td>
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