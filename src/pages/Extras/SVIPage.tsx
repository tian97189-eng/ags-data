import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { computeSVI } from '../../lib/extras';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import EmptyState from '../../components/common/EmptyState';

/** 污泥沉降性（SV / SVI）
 * 用户填：量筒体积、5min/30min 污泥层刻度读数、MLSS
 * 自动算：SV5/SV30(%) = 污泥层体积/量筒体积×100；SVI5/SVI30 = SV×10/MLSS (mL/g)
 */
export default function SVIPage() {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const [sampleCode, setSampleCode] = useState('');
  const [cylinderVolumeMl, setCylinderVolumeMl] = useState('100');
  const [v5Ml, setV5Ml] = useState('');
  const [v30Ml, setV30Ml] = useState('');
  const [mlss, setMlss] = useState('');

  const rows = useLiveQuery(
    () => db.sviRecords.orderBy('date').reverse().toArray(),
    [],
  );

  function numPos(s: string): number | null {
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function numGe0(s: string): number | null {
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const preview = computeSVI({
    cylinderVolumeMl: numPos(cylinderVolumeMl),
    v5Ml: numGe0(v5Ml),
    v30Ml: numGe0(v30Ml),
    mlss: numPos(mlss),
  });

  async function handleAdd() {
    if (!date || !sampleCode.trim()) {
      toast('请填日期和样品编号', 'warning');
      return;
    }
    const vol = numPos(cylinderVolumeMl);
    const v5 = numGe0(v5Ml);
    const v30 = numGe0(v30Ml);
    const ml = numPos(mlss);
    if (vol == null || v5 == null || v30 == null || ml == null) {
      toast('请填完量筒体积、5min/30min 读数和 MLSS', 'warning');
      return;
    }
    const r = computeSVI({ cylinderVolumeMl: vol, v5Ml: v5, v30Ml: v30, mlss: ml });
    await db.sviRecords.add({
      date, reactorId: null, sampleCode: sampleCode.trim(),
      cylinderVolumeMl: vol, v5Ml: v5, v30Ml: v30, mlss: ml,
      sv5: r.sv5, sv30: r.sv30, svi5: r.svi5, svi30: r.svi30,
      note: '', createdAt: new Date().toISOString(),
    });
    toast('已添加', 'success');
    setSampleCode('');
    setV5Ml('');
    setV30Ml('');
    setMlss('');
  }

  async function handleDelete(id: number) {
    await db.sviRecords.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">新增沉降性测量</div>
        <p className="text-xs text-slate-500 mb-3">
          取混合液于量筒，静置 5min 和 30min 后各读一次污泥层体积刻度。
          SV(%) = 污泥层体积 / 量筒体积 × 100；SVI(mL/g) = SV(%) × 10 / MLSS(g/L)。
          MLSS 可在「污泥浓度」里测得。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <label className="block">
            <span className="text-slate-500 text-xs">日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">样品编号</span>
            <input value={sampleCode} onChange={(e) => setSampleCode(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" placeholder="R1" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">量筒体积 (mL)</span>
            <input type="number" step="any" value={cylinderVolumeMl} onChange={(e) => setCylinderVolumeMl(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">5min 污泥层体积 (mL)</span>
            <input type="number" step="any" value={v5Ml} onChange={(e) => setV5Ml(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">30min 污泥层体积 (mL)</span>
            <input type="number" step="any" value={v30Ml} onChange={(e) => setV30Ml(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">MLSS (g/L)</span>
            <input type="number" step="any" value={mlss} onChange={(e) => setMlss(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1 text-xs" />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600">
            实时计算：
            SV5 = <span className="font-mono text-teal-700">{preview.sv5?.toFixed(1) ?? '—'}</span>% ·
            SV30 = <span className="font-mono text-teal-700">{preview.sv30?.toFixed(1) ?? '—'}</span>% ·
            SVI5 = <span className="font-mono text-teal-700">{preview.svi5?.toFixed(1) ?? '—'}</span> mL/g ·
            SVI30 = <span className="font-mono text-teal-700">{preview.svi30?.toFixed(1) ?? '—'}</span> mL/g
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
            <table className="w-full table-fixed border-collapse text-xs min-w-[680px]">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 w-24">日期</th>
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 w-20">样品</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-14">量筒</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-14">V5</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-14">V30</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">MLSS</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">SV5%</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">SV30%</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">SVI5</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">SVI30</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 w-12">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 px-2 border-b border-slate-50 whitespace-nowrap">{r.date}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50">{r.sampleCode}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.cylinderVolumeMl}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.v5Ml}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.v30Ml}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.mlss}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {r.sv5?.toFixed(1) ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {r.sv30?.toFixed(1) ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {r.svi5?.toFixed(1) ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {r.svi30?.toFixed(1) ?? '—'}
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
