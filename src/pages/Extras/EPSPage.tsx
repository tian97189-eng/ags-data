import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalibrationCurve } from '../../db/schema';
import {
  planPNSchedule,
  buildPNScheduleTimes,
  computeEPSFromAbsorbance,
  formatScheduleOffset,
} from '../../lib/extras';
import { resolveCurve } from '../../lib/calibration';
import { useAppStore } from '../../store/useAppStore';
import { trashRows } from '../../lib/trash';
import { today } from '../../lib/format';
import EmptyState from '../../components/common/EmptyState';
import SampleReminder from '../../components/common/SampleReminder';

/** EPS 胞外聚合物（PS 多糖 / PN 蛋白质）
 * PS / PN 浓度与氨氮一样走标准曲线：用户填吸光度（样/空/稀释），
 * 系统用「标准曲线」里 PS / PN 的生效标曲自动换算浓度，再结合 VSS 算含量。
 */
export default function EPSPage() {
  const toast = useAppStore((s) => s.toast);
  const [date, setDate] = useState(today());
  const [sampleCode, setSampleCode] = useState('');
  const [vssMg, setVssMg] = useState('');
  const [extractVolume, setExtractVolume] = useState('');

  // PS / PN 吸光度三要素（空白、稀释留空表示"用默认"）
  const [psSampleAbs, setPsSampleAbs] = useState('');
  const [psBlankAbs, setPsBlankAbs] = useState('');
  const [psDilution, setPsDilution] = useState('');
  const [pnSampleAbs, setPnSampleAbs] = useState('');
  const [pnBlankAbs, setPnBlankAbs] = useState('');
  const [pnDilution, setPnDilution] = useState('');

  // PN 加药计时规划
  const [pnSampleCount, setPnSampleCount] = useState('20');
  const [pnIntervalSec, setPnIntervalSec] = useState('20');
  const [pnPrepareMin, setPnPrepareMin] = useState('5');
  const [pnSettleA, setPnSettleA] = useState('10');
  const [pnSettleB, setPnSettleB] = useState('10');

  // PS / PN 指标（extras 类别，seed 内置）
  const psIndicator = useLiveQuery(
    () => db.indicators.where('name').equals('PS（多糖）').first(),
    [],
  );
  const pnIndicator = useLiveQuery(
    () => db.indicators.where('name').equals('PN（蛋白质）').first(),
    [],
  );

  // PS / PN 在所选日期生效的标曲
  const psCurve = useLiveQuery(
    () =>
      psIndicator?.id != null
        ? resolveCurve(psIndicator.id, date)
        : Promise.resolve(null as CalibrationCurve | null),
    [psIndicator?.id, date],
  );
  const pnCurve = useLiveQuery(
    () =>
      pnIndicator?.id != null
        ? resolveCurve(pnIndicator.id, date)
        : Promise.resolve(null as CalibrationCurve | null),
    [pnIndicator?.id, date],
  );

  const rows = useLiveQuery(
    () => db.epsRecords.orderBy('date').reverse().toArray(),
    [],
  );

  /** 严格正数（VSS、体积、稀释） */
  function numPos(s: string): number | null {
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  /** 非负（吸光度、空白） */
  function numGe0(s: string): number | null {
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const preview = computeEPSFromAbsorbance({
    vssMg: numPos(vssMg),
    extractVolume: numPos(extractVolume),
    psSampleAbs: numGe0(psSampleAbs),
    psBlankAbs: numGe0(psBlankAbs),
    psDilution: psDilution === '' ? (psIndicator?.defaultDilution ?? 1) : numPos(psDilution),
    psCurve: psCurve ?? null,
    pnSampleAbs: numGe0(pnSampleAbs),
    pnBlankAbs: numGe0(pnBlankAbs),
    pnDilution: pnDilution === '' ? (pnIndicator?.defaultDilution ?? 1) : numPos(pnDilution),
    pnCurve: pnCurve ?? null,
  });

  const pnSchedule = planPNSchedule({
    sampleCount: Math.max(0, Math.floor(Number(pnSampleCount) || 0)),
    intervalSec: Number(pnIntervalSec) || 0,
    settleAMin: Number(pnSettleA) || 0,
    settleBMin: Number(pnSettleB) || 0,
    prepareMin: Number(pnPrepareMin) || 0,
  });

  // 响铃时刻：点「开始提醒」那一刻按当前计时参数重新生成（绝对时间 + 动作文案）
  const buildReminders = () =>
    buildPNScheduleTimes(
      planPNSchedule({
        sampleCount: Math.max(0, Math.floor(Number(pnSampleCount) || 0)),
        intervalSec: Number(pnIntervalSec) || 0,
        settleAMin: Number(pnSettleA) || 0,
        settleBMin: Number(pnSettleB) || 0,
        prepareMin: Number(pnPrepareMin) || 0,
      }),
      new Date(),
    );

  async function handleAdd() {
    if (!date || !sampleCode.trim()) {
      toast('请填日期和样品编号', 'warning');
      return;
    }
    const vss = numPos(vssMg);
    const vol = numPos(extractVolume);
    const psA = numGe0(psSampleAbs);
    const pnA = numGe0(pnSampleAbs);
    if (vss == null || vol == null || psA == null || pnA == null) {
      toast('请填完 VSS、提取体积、PS/PN 吸光度', 'warning');
      return;
    }
    if (!psCurve || !pnCurve) {
      toast('PS 或 PN 还没有生效的标准曲线，请先到「系统设置 → 标准曲线」建标曲', 'warning');
      return;
    }
    const psDil = psDilution === '' ? (psIndicator?.defaultDilution ?? 1) : numPos(psDilution);
    const pnDil = pnDilution === '' ? (pnIndicator?.defaultDilution ?? 1) : numPos(pnDilution);
    const psBlank = numGe0(psBlankAbs);
    const pnBlank = numGe0(pnBlankAbs);

    const r = computeEPSFromAbsorbance({
      vssMg: vss,
      extractVolume: vol,
      psSampleAbs: psA,
      psBlankAbs: psBlank,
      psDilution: psDil,
      psCurve,
      pnSampleAbs: pnA,
      pnBlankAbs: pnBlank,
      pnDilution: pnDil,
      pnCurve,
    });
    await db.epsRecords.add({
      date,
      reactorId: null,
      sampleCode: sampleCode.trim(),
      vssMg: vss,
      psSampleAbs: psA,
      psBlankAbs: psBlank,
      psDilution: psDil,
      psCurveId: psCurve.id ?? null,
      pnSampleAbs: pnA,
      pnBlankAbs: pnBlank,
      pnDilution: pnDil,
      pnCurveId: pnCurve.id ?? null,
      psConc: r.psConc,
      pnConc: r.pnConc,
      extractVolume: vol,
      psContent: r.psContent,
      pnContent: r.pnContent,
      pnPsRatio: r.pnPsRatio,
      note: '',
      createdAt: new Date().toISOString(),
    });
    toast('已添加', 'success');
    setSampleCode('');
    setVssMg('');
    setExtractVolume('');
    setPsSampleAbs('');
    setPsBlankAbs('');
    setPsDilution('');
    setPnSampleAbs('');
    setPnBlankAbs('');
    setPnDilution('');
  }

  async function handleDelete(id: number) {
    const row = await db.epsRecords.get(id);
    if (row) await trashRows('epsRecords', [row]);
    await db.epsRecords.delete(id);
  }

  const curveHint = (curve: CalibrationCurve | null | undefined, name: string) =>
    curve
      ? `k=${curve.k.toFixed(4)} b=${curve.b.toFixed(4)}`
      : `${name} 尚无标曲，请到「系统设置 → 标准曲线」建`;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-1">新增 EPS 测量</div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          EPS（胞外聚合物）由蛋白质（PN）和多糖（PS）构成。测 PN / PS 吸光度后，按标准曲线自动换算浓度，再结合 VSS 算出每克污泥的含量。标曲在「系统设置 → 标准曲线」里给 PS（多糖）、PN（蛋白质）建。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">样品编号</span>
            <input value={sampleCode} onChange={(e) => setSampleCode(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" placeholder="R1-D1" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">VSS 质量 (mg)</span>
            <input type="number" step="any" value={vssMg} onChange={(e) => setVssMg(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">提取液体积 (mL)</span>
            <input type="number" step="any" value={extractVolume} onChange={(e) => setExtractVolume(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-3">
          <div className="border border-slate-100 dark:border-slate-800 rounded-md p-3">
            <div className="text-xs font-medium mb-1">PS（多糖）吸光度</div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">{curveHint(psCurve, 'PS')}</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-slate-500 dark:text-slate-400 text-xs">样品吸光度</span>
                <input type="number" step="any" value={psSampleAbs} onChange={(e) => setPsSampleAbs(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
              </label>
              <label className="block">
                <span className="text-slate-500 dark:text-slate-400 text-xs">空白吸光度</span>
                <input type="number" step="any" value={psBlankAbs} onChange={(e) => setPsBlankAbs(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
              </label>
              <label className="block">
                <span className="text-slate-500 dark:text-slate-400 text-xs">稀释倍数</span>
                <input type="number" step="any" value={psDilution} onChange={(e) => setPsDilution(e.target.value)} placeholder={String(psIndicator?.defaultDilution ?? 1)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
              </label>
            </div>
            <div className="text-[11px] text-teal-700 mt-2">
              浓度 = <span className="font-mono">{preview.psConc?.toFixed(4) ?? '—'}</span> mg/L
            </div>
          </div>

          <div className="border border-slate-100 dark:border-slate-800 rounded-md p-3">
            <div className="text-xs font-medium mb-1">PN（蛋白质）吸光度</div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">{curveHint(pnCurve, 'PN')}</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-slate-500 dark:text-slate-400 text-xs">样品吸光度</span>
                <input type="number" step="any" value={pnSampleAbs} onChange={(e) => setPnSampleAbs(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
              </label>
              <label className="block">
                <span className="text-slate-500 dark:text-slate-400 text-xs">空白吸光度</span>
                <input type="number" step="any" value={pnBlankAbs} onChange={(e) => setPnBlankAbs(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
              </label>
              <label className="block">
                <span className="text-slate-500 dark:text-slate-400 text-xs">稀释倍数</span>
                <input type="number" step="any" value={pnDilution} onChange={(e) => setPnDilution(e.target.value)} placeholder={String(pnIndicator?.defaultDilution ?? 1)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
              </label>
            </div>
            <div className="text-[11px] text-teal-700 mt-2">
              浓度 = <span className="font-mono">{preview.pnConc?.toFixed(4) ?? '—'}</span> mg/L
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600 dark:text-slate-400">
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

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-1">PN 加药计时规划</div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          测 PN 时需依次给每个样品加甲液 → 静置 → 加乙液 → 静置 → 测吸光度。多个样品错开加药，自动排出每个样品的加甲液 / 加乙液 / 测量时刻。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">样品数</span>
            <input type="number" min={1} value={pnSampleCount} onChange={(e) => setPnSampleCount(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">每样间隔(秒)</span>
            <input type="number" min={1} value={pnIntervalSec} onChange={(e) => setPnIntervalSec(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">准备时间(分)</span>
            <input type="number" min={0} value={pnPrepareMin} onChange={(e) => setPnPrepareMin(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">甲液静置(分)</span>
            <input type="number" min={0} value={pnSettleA} onChange={(e) => setPnSettleA(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">乙液静置(分)</span>
            <input type="number" min={0} value={pnSettleB} onChange={(e) => setPnSettleB(e.target.value)} className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs" />
          </label>
        </div>

        {pnSchedule.steps.length > 0 && (
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              准备 <span className="font-mono text-teal-700">{formatScheduleOffset(pnSchedule.prepareSec)}</span> 后开始 ·
              共 {pnSchedule.steps.length} 样 ·
              最后一个样品测完在 <span className="font-mono text-teal-700">{formatScheduleOffset(pnSchedule.steps[pnSchedule.steps.length - 1].measureOffsetSec)}</span>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full table-fixed border-collapse text-xs min-w-[480px]">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400">
                    <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">样品</th>
                    <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">加甲液</th>
                    <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">加乙液</th>
                    <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">测量</th>
                  </tr>
                </thead>
                <tbody>
                  {pnSchedule.steps.map((s) => (
                    <tr key={s.sampleNo}>
                      <td className="py-1.5 px-2 border-b border-slate-50">#{s.sampleNo}</td>
                      <td className="py-1.5 px-2 border-b border-slate-50 text-right font-mono">{formatScheduleOffset(s.addAOffsetSec)}</td>
                      <td className="py-1.5 px-2 border-b border-slate-50 text-right font-mono text-teal-700">{formatScheduleOffset(s.addBOffsetSec)}</td>
                      <td className="py-1.5 px-2 border-b border-slate-50 text-right font-mono text-teal-700">{formatScheduleOffset(s.measureOffsetSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pnSchedule.steps.length > 0 && (
          <div className="mt-3">
            <SampleReminder
              label="PN 加药提醒"
              buildExternalTimes={buildReminders}
              externalHint="点开始后，到每个样品「加甲液 / 加乙液 / 测吸光度」时间点响铃"
            />
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-2">历史记录（{rows?.length ?? 0} 条）</div>
        {!rows || rows.length === 0 ? (
          <EmptyState title="还没有数据" desc="在上面的表单填入数据并点添加" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full table-fixed border-collapse text-xs min-w-[720px]">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400">
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-24">日期</th>
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">样品</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">PS 浓</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">PN 浓</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">PS 含量</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">PN 含量</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">PN/PS</th>
                  <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-12">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 px-2 border-b border-slate-50 whitespace-nowrap">{r.date}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50">{r.sampleCode}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.psConc?.toFixed(3) ?? '—'}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">{r.pnConc?.toFixed(3) ?? '—'}</td>
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
