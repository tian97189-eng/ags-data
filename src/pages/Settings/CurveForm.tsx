import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { linearRegression, saveCurve } from '../../lib/calibration';
import { today, formatNumber } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import type { Indicator } from '../../db/schema';

interface Row {
  c: string;
  a: string;
}

export default function CurveForm({
  indicator,
  onClose,
  onSaved,
}: {
  indicator: Indicator;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useAppStore((s) => s.toast);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [batchNo, setBatchNo] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { c: '', a: '' },
    { c: '', a: '' },
    { c: '', a: '' },
    { c: '', a: '' },
    { c: '', a: '' },
  ]);

  const points = useMemo(() => {
    return rows
      .map((r) => ({
        concentration: parseFloat(r.c),
        absorbance: parseFloat(r.a),
      }))
      .filter((p) => Number.isFinite(p.concentration) && Number.isFinite(p.absorbance));
  }, [rows]);

  const fit = useMemo(() => linearRegression(points), [points]);

  const chartOption = useMemo(() => {
    const scatter = points.map((p) => [p.concentration, p.absorbance]);
    const maxX = points.length ? Math.max(...points.map((p) => p.concentration)) : 2;
    const line =
      fit && maxX > 0
        ? [
            [0, fit.b],
            [maxX, fit.k * maxX + fit.b],
          ]
        : [];
    return {
      grid: { left: 44, right: 16, top: 16, bottom: 28 },
      xAxis: { type: 'value', name: 'mg/L', nameTextStyle: { fontSize: 10 } },
      yAxis: { type: 'value', name: '吸光度', nameTextStyle: { fontSize: 10 } },
      series: [
        {
          type: 'scatter',
          data: scatter,
          symbolSize: 7,
          itemStyle: { color: '#534AB7' },
        },
        {
          type: 'line',
          data: line,
          showSymbol: false,
          lineStyle: { color: '#7F77DD', width: 1.5 },
        },
      ],
    };
  }, [points, fit]);

  function updateRow(i: number, key: 'c' | 'a', value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  async function save() {
    if (!fit) {
      toast('至少需要 2 个有效标液点才能拟合', 'warning');
      return;
    }
    if (!effectiveFrom) {
      toast('请选择生效日期', 'warning');
      return;
    }
    const result = await saveCurve({
      indicatorId: indicator.id!,
      effectiveFrom,
      k: fit.k,
      b: fit.b,
      r2: fit.r2,
      points,
      batchNo: batchNo.trim(),
      note: note.trim(),
      createdAt: new Date().toISOString(),
    });
    if (!result.ok) {
      toast(result.error || '保存失败', 'error');
      return;
    }
    toast('标曲已保存', 'success');
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-5 w-full max-w-xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium">新建标曲 · {indicator.name}</h3>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <label className="block">
            <span className="text-slate-500">生效日期</span>
            <input
              type="date"
              className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-slate-500">试剂批号</span>
            <input
              className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">标液点</div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1 px-1 border-b border-slate-200">浓度 mg/L</th>
                  <th className="text-left py-1 px-1 border-b border-slate-200">吸光度</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1 px-1">
                      <input
                        type="number"
                        step="any"
                        className="w-full border border-slate-200 rounded px-2 py-1"
                        value={r.c}
                        onChange={(e) => updateRow(i, 'c', e.target.value)}
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="number"
                        step="any"
                        className="w-full border border-slate-200 rounded px-2 py-1"
                        value={r.a}
                        onChange={(e) => updateRow(i, 'a', e.target.value)}
                      />
                    </td>
                    <td className="py-1 px-1">
                      <button
                        type="button"
                        className="text-red-500"
                        onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                      >
                        删
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="mt-2 text-xs text-teal-700"
              onClick={() => setRows((rs) => [...rs, { c: '', a: '' }])}
            >
              + 加一行
            </button>
          </div>

          <div>
            <ReactECharts
              option={chartOption}
              style={{ height: 180 }}
              notMerge
              lazyUpdate
            />
            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
              <div className="bg-slate-50 rounded-md p-2">
                <div className="text-[11px] text-slate-500">k</div>
                <div className="text-base font-medium">{fit ? formatNumber(fit.k, 4) : '—'}</div>
              </div>
              <div className="bg-slate-50 rounded-md p-2">
                <div className="text-[11px] text-slate-500">b</div>
                <div className="text-base font-medium">{fit ? formatNumber(fit.b, 4) : '—'}</div>
              </div>
              <div className="bg-slate-50 rounded-md p-2">
                <div className="text-[11px] text-slate-500">R²</div>
                <div className={`text-sm font-medium ${fit && fit.r2 < 0.99 ? 'text-amber-600' : 'text-teal-700'}`}>
                  {fit ? formatNumber(fit.r2, 4) : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <label className="block mt-3 text-xs">
          <span className="text-slate-500">备注</span>
          <input
            className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
