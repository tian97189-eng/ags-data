import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ReactECharts from 'echarts-for-react';
import { db } from '../../db/schema';
import { buildDailyTrend, buildCycleSeries, buildCycleOverlay, type TrendSeries } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import Chip from '../../components/common/Chip';

type Mode = 'daily' | 'cycle' | 'overlay';

export default function ChartPage() {
  const chartRef = useRef<ReactECharts>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [indicatorId, setIndicatorId] = useState<number | null>(null);
  const [reactorIds, setReactorIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [overlayReactorId, setOverlayReactorId] = useState<number | null>(null);

  const measurements = useLiveQuery(() => db.measurements.toArray(), []);
  const reactors = useLiveQuery(async () => {
    const all = await db.reactors.toArray();
    return all.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);
  const indicators = useLiveQuery(() => db.indicators.orderBy('sortOrder').toArray(), []);
  const cycles = useLiveQuery(() => db.cycles.orderBy('date').toArray(), []);

  const indicator = indicators?.find((i) => i.id === indicatorId);

  const series = useMemo<TrendSeries[]>(() => {
    if (!indicatorId) return [];
    const rs = (reactors ?? []).filter((r) => (reactorIds.length ? reactorIds.includes(r.id!) : true));
    if (mode === 'daily') {
      const filtered = (measurements ?? []).filter(
        (m) =>
          m.indicatorId === indicatorId &&
          m.scene === 'daily' &&
          (!dateFrom || m.date >= dateFrom) &&
          (!dateTo || m.date <= dateTo),
      );
      return buildDailyTrend(filtered, rs);
    }
    if (mode === 'cycle' && cycleId != null) {
      const filtered = (measurements ?? []).filter(
        (m) => m.indicatorId === indicatorId && m.scene === 'cycle' && m.cycleRunId === cycleId,
      );
      return buildCycleSeries(filtered, rs, cycleId);
    }
    if (mode === 'overlay' && overlayReactorId != null) {
      const filtered = (measurements ?? []).filter(
        (m) => m.indicatorId === indicatorId && m.scene === 'cycle' && m.reactorId === overlayReactorId,
      );
      return buildCycleOverlay(filtered, cycles ?? [], overlayReactorId);
    }
    return [];
  }, [measurements, reactors, reactorIds, indicatorId, mode, dateFrom, dateTo, cycleId, overlayReactorId, cycles]);

  const option = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: series.map((s) => s.name), top: 0 },
      grid: { left: 50, right: 20, top: 36, bottom: 50 },
      xAxis: {
        type: 'category' as const,
        name: mode === 'daily' ? '日期' : '时间',
        nameTextStyle: { fontSize: 10 },
      },
      yAxis: { type: 'value' as const, name: indicator?.unit ?? 'mg/L', nameTextStyle: { fontSize: 10 } },
      dataZoom: [{ type: 'inside' as const }, { type: 'slider' as const, height: 16, bottom: 4 }],
      series: series.map((s) => ({
        name: s.name,
        type: 'line' as const,
        data: s.data,
        connectNulls: true,
        symbolSize: 5,
      })),
    };
  }, [series, mode, indicator]);

  function toggleReactor(id: number) {
    setReactorIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function exportPng() {
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst) return;
    const url = inst.getDataURL({ backgroundColor: '#fff', pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = url;
    a.download = '图表.png';
    a.click();
  }

  return (
    <div>
      <PageHeader
        title="可视化"
        desc="趋势图、周期曲线与对比分析"
        actions={
          <button type="button" onClick={exportPng} disabled={series.length === 0} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white disabled:opacity-40">
            导出图片
          </button>
        }
      />

      <div className="grid md:grid-cols-[170px_minmax(0,1fr)] gap-4">
        <div className="text-xs space-y-4">
          <div>
            <div className="text-slate-500 mb-1.5">数据类型</div>
            <div className="space-y-1">
              <button type="button" onClick={() => setMode('daily')} className={`block w-full text-left px-2 py-1 rounded ${mode === 'daily' ? 'bg-teal-50 text-teal-800' : 'text-slate-600'}`}>日常趋势</button>
              <button type="button" onClick={() => setMode('cycle')} className={`block w-full text-left px-2 py-1 rounded ${mode === 'cycle' ? 'bg-teal-50 text-teal-800' : 'text-slate-600'}`}>周期曲线</button>
              <button type="button" onClick={() => setMode('overlay')} className={`block w-full text-left px-2 py-1 rounded ${mode === 'overlay' ? 'bg-teal-50 text-teal-800' : 'text-slate-600'}`}>周期叠周期</button>
            </div>
          </div>

          {mode === 'daily' && (
            <div>
              <div className="text-slate-500 mb-1.5">日期范围</div>
              <div className="space-y-1">
                <input type="date" className="w-full border border-slate-200 rounded px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <input type="date" className="w-full border border-slate-200 rounded px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          )}

          {mode === 'cycle' && (
            <div>
              <div className="text-slate-500 mb-1.5">周期</div>
              <select className="w-full border border-slate-200 rounded px-2 py-1" value={cycleId ?? ''} onChange={(e) => setCycleId(Number(e.target.value) || null)}>
                <option value="">选择周期</option>
                {cycles?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {mode === 'overlay' && (
            <div>
              <div className="text-slate-500 mb-1.5">反应器</div>
              <select className="w-full border border-slate-200 rounded px-2 py-1" value={overlayReactorId ?? ''} onChange={(e) => setOverlayReactorId(Number(e.target.value) || null)}>
                <option value="">选择罐</option>
                {reactors?.map((r) => (
                  <option key={r.id} value={r.id}>{r.code}</option>
                ))}
              </select>
            </div>
          )}

          {mode !== 'overlay' && (
            <div>
              <div className="text-slate-500 mb-1.5">反应器</div>
              <div className="flex gap-1 flex-wrap">
                {reactors?.map((r) => (
                  <Chip key={r.id} active={reactorIds.includes(r.id!)} onClick={() => toggleReactor(r.id!)}>
                    {r.code}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-slate-500 mb-1.5">指标</div>
            <select className="w-full border border-slate-200 rounded px-2 py-1" value={indicatorId ?? ''} onChange={(e) => setIndicatorId(Number(e.target.value) || null)}>
              <option value="">选择指标</option>
              {indicators?.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          {series.length === 0 ? (
            <EmptyState title="请选择指标" desc="在左侧选择指标（必要时选择罐、日期或周期）" />
          ) : (
            <>
              <ReactECharts ref={chartRef} option={option} style={{ height: 380 }} notMerge lazyUpdate />
              <div className="flex gap-4 flex-wrap text-xs mt-2">
                {series.map((s) => (
                  <span key={s.name} className="text-slate-600">
                    {s.name}　均值 {formatNumber(s.mean)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
