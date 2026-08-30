import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ReactECharts from 'echarts-for-react';
import { db, type CalibrationCurve } from '../../db/schema';
import { countMeasurementsByCurve } from '../../lib/calibration';
import { today, formatNumber } from '../../lib/format';
import Chip from '../../components/common/Chip';
import EmptyState from '../../components/common/EmptyState';
import CurveForm from './CurveForm';

export default function CurveSettings() {
  const indicators = useLiveQuery(
    () => db.indicators.where('category').equals('basic').sortBy('sortOrder'),
    [],
  );
  const [indicatorId, setIndicatorId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [counts, setCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (indicatorId == null && indicators && indicators.length > 0) {
      setIndicatorId(indicators[0].id!);
    }
  }, [indicators, indicatorId]);

  const indicator = indicators?.find((i) => i.id === indicatorId);

  const curves = useLiveQuery(
    () =>
      indicatorId != null
        ? db.curves.where('indicatorId').equals(indicatorId).toArray()
        : Promise.resolve([] as CalibrationCurve[]),
    [indicatorId],
  );

  useEffect(() => {
    if (!curves) return;
    let cancelled = false;
    (async () => {
      const map: Record<number, number> = {};
      for (const c of curves) {
        map[c.id!] = await countMeasurementsByCurve(c.id!);
      }
      if (!cancelled) setCounts(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [curves]);

  const current = curves
    ?.filter((c) => c.effectiveTo === null)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];

  const history =
    curves?.filter((c) => c.id !== current?.id).sort((a, b) =>
      a.effectiveFrom < b.effectiveFrom ? 1 : -1,
    ) ?? [];

  const isCod = indicator?.method === 'direct';

  const currentOption = useMemo(() => {
    const pts = current?.points ?? [];
    const scatter = pts.map((p) => [p.concentration, p.absorbance]);
    return {
      grid: { left: 44, right: 16, top: 16, bottom: 28 },
      xAxis: { type: 'value', name: 'mg/L', nameTextStyle: { fontSize: 10 } },
      yAxis: { type: 'value', name: '吸光度', nameTextStyle: { fontSize: 10 } },
      series: [
        {
          type: 'scatter',
          data: scatter,
          symbolSize: 6,
          itemStyle: { color: '#534AB7' },
        },
        ...(current
          ? [
              {
                type: 'line',
                data: pts.map((p) => [p.concentration, current.k * p.concentration + current.b]),
                showSymbol: false,
                lineStyle: { color: '#7F77DD', width: 1.5 },
              },
            ]
          : []),
      ],
    };
  }, [current]);

  return (
    <div>
      <div className="flex items-center gap-1 flex-wrap mb-4">
        {indicators?.map((i) => (
          <Chip
            key={i.id}
            active={i.id === indicatorId && !isCod}
            onClick={() => setIndicatorId(i.id!)}
            title={i.method === 'direct' ? '仪器直读，不用标曲' : undefined}
          >
            {i.name}
          </Chip>
        ))}
        <span className="flex-1"></span>
        {!isCod && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
          >
            新建标曲
          </button>
        )}
      </div>

      {isCod ? (
        <EmptyState
          title="COD 是仪器直读，不需要标准曲线"
          desc="在录入时直接填仪器给出的浓度即可"
        />
      ) : (
        <>
          <div className="text-xs text-slate-500 mb-2">
            当前生效 · {indicator?.name}
            {current && (
              <span className="text-slate-400 ml-1">（{current.effectiveFrom} 起）</span>
            )}
          </div>

          {!current ? (
            <EmptyState
              title="还没有标准曲线"
              desc="点右上角「新建标曲」，录入标液点后自动拟合出 k、b 和 R²"
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-4 border border-slate-200 rounded-lg p-4 mb-4">
              <div>
                <ReactECharts option={currentOption} style={{ height: 180 }} notMerge lazyUpdate />
                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  <div className="bg-slate-50 rounded-md p-2">
                    <div className="text-[11px] text-slate-500">k</div>
                    <div className="text-sm font-medium">{formatNumber(current.k, 4)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-md p-2">
                    <div className="text-[11px] text-slate-500">b</div>
                    <div className="text-sm font-medium">{formatNumber(current.b, 4)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-md p-2">
                    <div className="text-[11px] text-slate-500">R²</div>
                    <div className="text-sm font-medium text-teal-700">
                      {formatNumber(current.r2, 4)}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-md p-2">
                    <div className="text-[11px] text-slate-500">批号</div>
                    <div className="text-sm font-medium">{current.batchNo || '—'}</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">标液点</div>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left py-1 px-1 border-b border-slate-200">浓度</th>
                      <th className="text-left py-1 px-1 border-b border-slate-200">吸光度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.points.map((p, i) => (
                      <tr key={i}>
                        <td className="py-1 px-1 border-b border-slate-100">{p.concentration}</td>
                        <td className="py-1 px-1 border-b border-slate-100">{p.absorbance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-500 mb-2">历史曲线</div>
          {history.length === 0 ? (
            <div className="text-xs text-slate-400 py-4">暂无历史曲线</div>
          ) : (
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-2 px-2 border-b border-slate-200">生效区间</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">k</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">b</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">R²</th>
                  <th className="text-left py-2 px-2 border-b border-slate-200">批号</th>
                  <th className="text-left py-2 px-2 border-b border-slate-200">状态</th>
                </tr>
              </thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 px-2 border-b border-slate-100">
                      {c.effectiveFrom}
                      {c.effectiveTo ? ` → ${c.effectiveTo}` : ' 起'}
                    </td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right">
                      {formatNumber(c.k, 4)}
                    </td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right">
                      {formatNumber(c.b, 4)}
                    </td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right">
                      {formatNumber(c.r2, 4)}
                    </td>
                    <td className="py-2 px-2 border-b border-slate-100">{c.batchNo || '—'}</td>
                    <td className="py-2 px-2 border-b border-slate-100 text-slate-500">
                      停用 · 仍算着 {(counts[c.id!] ?? 0)} 条旧数据
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {showForm && indicator && (
        <CurveForm
          indicator={indicator}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
