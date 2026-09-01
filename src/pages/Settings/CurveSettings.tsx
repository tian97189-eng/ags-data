import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ReactECharts from 'echarts-for-react';
import { db, type CalibrationCurve } from '../../db/schema';
import { countMeasurementsByCurve, deleteCurve } from '../../lib/calibration';
import { today, formatNumber } from '../../lib/format';
import Chip from '../../components/common/Chip';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CurveForm from './CurveForm';
import FormulaForm from './FormulaForm';
import { useAppStore } from '../../store/useAppStore';

export default function CurveSettings() {
  const toast = useAppStore((s) => s.toast);
  const indicators = useLiveQuery(
    async () => {
      const all = await db.indicators.toArray();
      return all
        .filter((i) => (i.category === 'basic' || i.category === 'extras') && i.active)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [],
  );
  const [indicatorId, setIndicatorId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [deleting, setDeleting] = useState<CalibrationCurve | null>(null);

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
  const isFormula = current?.formulaType === 'formula';

  async function handleDelete() {
    if (!deleting) return;
    await deleteCurve(deleting.id!);
    setDeleting(null);
    toast('曲线已删除', 'info');
  }

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
          <>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-3 py-1.5 text-xs rounded-md border border-teal-300 text-teal-700 hover:bg-teal-50"
            >
              新建标曲（多点）
            </button>
            <button
              type="button"
              onClick={() => setShowFormula(true)}
              className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
            >
              手动公式
            </button>
          </>
        )}
      </div>

      {isCod ? (
        <EmptyState
          title="COD 是仪器直读，不需要标准曲线"
          desc="在录入时直接填仪器给出的浓度即可"
        />
      ) : (
        <>
          <div className="flex items-center text-xs text-slate-500 mb-2">
            <span>
              当前生效 · {indicator?.name}
              {current && (
                <span className="text-slate-400 ml-1">（{current.effectiveFrom} 起）</span>
              )}
            </span>
            {current && (
              <button
                type="button"
                onClick={() => setDeleting(current)}
                className="ml-auto text-red-500 hover:text-red-600"
              >
                删除此曲线
              </button>
            )}
          </div>

          {!current ? (
            <EmptyState
              title="还没有标准曲线"
              desc="点右上角「新建标曲（多点）」录入标液点自动拟合，或「手动公式」直接填公式"
            />
          ) : isFormula ? (
            <div className="bg-white rounded-lg shadow-card p-4 mb-4">
              <div className="text-xs text-slate-500 mb-2">当前公式</div>
              <div className="font-mono text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mb-3 break-all">
                {current.formula}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-50 rounded-md p-2">
                  <div className="text-[11px] text-slate-500">A</div>
                  <div className="text-xs">检测样吸光度</div>
                </div>
                <div className="bg-slate-50 rounded-md p-2">
                  <div className="text-[11px] text-slate-500">A0</div>
                  <div className="text-xs">空白吸光度</div>
                </div>
                <div className="bg-slate-50 rounded-md p-2">
                  <div className="text-[11px] text-slate-500">D</div>
                  <div className="text-xs">稀释倍数</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 mt-2">试剂批号：{current.batchNo || '—'}</div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 bg-white rounded-lg shadow-card p-4 mb-4">
              <div>
                <ReactECharts option={currentOption} style={{ height: 180 }} notMerge lazyUpdate />
                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  <div className="bg-slate-50 rounded-md p-2">
                    <div className="text-[11px] text-slate-500">k</div>
                    <div className="text-base font-medium">{formatNumber(current.k, 4)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-md p-2">
                    <div className="text-[11px] text-slate-500">b</div>
                    <div className="text-base font-medium">{formatNumber(current.b, 4)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-md p-2">
                    <div className="text-[11px] text-slate-500">R²</div>
                    <div className="text-sm font-medium text-teal-700">
                      {formatNumber(current.r2, 4)}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-md p-2">
                    <div className="text-[11px] text-slate-500">批号</div>
                    <div className="text-base font-medium">{current.batchNo || '—'}</div>
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
                  <th className="text-left py-2 px-2 border-b border-slate-200">方式</th>
                  <th className="text-left py-2 px-2 border-b border-slate-200">参数 / 公式</th>
                  <th className="text-left py-2 px-2 border-b border-slate-200">批号</th>
                  <th className="text-left py-2 px-2 border-b border-slate-200">状态</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">操作</th>
                </tr>
              </thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 px-2 border-b border-slate-100">
                      {c.effectiveFrom}
                      {c.effectiveTo ? ` → ${c.effectiveTo}` : ' 起'}
                    </td>
                    <td className="py-2 px-2 border-b border-slate-100">
                      {c.formulaType === 'formula' ? '公式' : '拟合'}
                    </td>
                    <td className="py-2 px-2 border-b border-slate-100">
                      {c.formulaType === 'formula' ? (
                        <span className="font-mono text-[11px]">{c.formula}</span>
                      ) : (
                        <span className="text-slate-500">
                          k={formatNumber(c.k, 4)} b={formatNumber(c.b, 4)} R²={formatNumber(c.r2, 4)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 border-b border-slate-100">{c.batchNo || '—'}</td>
                    <td className="py-2 px-2 border-b border-slate-100 text-slate-500">
                      停用 · 仍算着 {(counts[c.id!] ?? 0)} 条旧数据
                    </td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleting(c)}
                        className="text-red-500 hover:text-red-600"
                      >
                        删除
                      </button>
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

      {showFormula && indicator && (
        <FormulaForm
          indicator={indicator}
          onClose={() => setShowFormula(false)}
          onSaved={() => setShowFormula(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="删除标准曲线"
        message={
          deleting?.effectiveTo === null
            ? `确定删除「${indicator?.name}」当前生效的曲线吗？\n删除后该指标将没有可用标曲，新数据无法换算；已录入数据的浓度不受影响。`
            : `确定删除这条历史曲线吗？\n仍有 ${counts[deleting?.id ?? -1] ?? 0} 条旧数据引用它，删除后这些数据会失去曲线追溯，但已计算的浓度值不受影响。`
        }
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
