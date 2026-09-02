import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ReactECharts from 'echarts-for-react';
import { db } from '../../db/schema';
import { buildDailyTrend, buildCycleSeries, buildCycleOverlay, type TrendSeries } from '../../lib/chart';
import { computeParticleDistribution } from '../../lib/extras';
import { formatNumber } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import Chip from '../../components/common/Chip';

type Mode = 'daily' | 'cycle' | 'overlay' | 'extras';
type ExtrasKind = 'mlss' | 'particle' | 'eps';
type ExtrasField = 'mlss' | 'mlvss' | 'd50' | 'psContent' | 'pnContent' | 'pnPsRatio';

export default function ChartPage() {
  const chartRef = useRef<ReactECharts>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [indicatorId, setIndicatorId] = useState<number | null>(null);
  const [reactorIds, setReactorIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [overlayReactorId, setOverlayReactorId] = useState<number | null>(null);
  const [overlayCycleIds, setOverlayCycleIds] = useState<number[]>([]); // 空 = 全选
  const [extrasKind, setExtrasKind] = useState<ExtrasKind>('mlss');
  const [extrasField, setExtrasField] = useState<ExtrasField>('mlss');

  const measurements = useLiveQuery(() => db.measurements.toArray(), []);
  const mlss = useLiveQuery(() => db.mlssRecords.toArray(), []);
  const particle = useLiveQuery(() => db.particleSizeRecords.toArray(), []);
  const particleRanges = useLiveQuery(() => db.particleSizeRanges.toArray(), []);
  const eps = useLiveQuery(() => db.epsRecords.toArray(), []);
  const reactors = useLiveQuery(async () => {
    const all = await db.reactors.toArray();
    return all.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);
  const indicators = useLiveQuery(() => db.indicators.orderBy('sortOrder').toArray(), []);
  const cycles = useLiveQuery(() => db.cycles.orderBy('date').toArray(), []);

  const indicator = indicators?.find((i) => i.id === indicatorId);

  const measurementSeries = useMemo<TrendSeries[]>(() => {
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
      const selCycles = (cycles ?? [])
        .filter((c) => overlayCycleIds.length === 0 || overlayCycleIds.includes(c.id!))
        .map((c) => ({ id: c.id!, name: c.name }));
      return buildCycleOverlay(filtered, selCycles, overlayReactorId);
    }
    return [];
  }, [measurements, reactors, reactorIds, indicatorId, mode, dateFrom, dateTo, cycleId, overlayReactorId, overlayCycleIds, cycles]);

  /** 其他指标（污泥浓度/粒径 d50/EPS）按日期聚合时间序列 */
  const extrasSeries = useMemo<TrendSeries[]>(() => {
    if (mode !== 'extras') return [];
    if (extrasKind === 'mlss') {
      const map = new Map<string, number[]>();
      for (const r of mlss ?? []) {
        if (dateFrom && r.date < dateFrom) continue;
        if (dateTo && r.date > dateTo) continue;
        const v = extrasField === 'mlvss' ? r.mlvss : r.mlss;
        if (v == null) continue;
        const list = map.get(r.date) ?? [];
        list.push(v);
        map.set(r.date, list);
      }
      const data = Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([d, vs]) => [d, vs.reduce((s, v) => s + v, 0) / vs.length]);
      return [{ name: extrasField === 'mlvss' ? 'MLVSS (g/L)' : 'MLSS (g/L)', data }];
    }
    if (extrasKind === 'particle') {
      // 每天的 d50：用 lib/extras.computeParticleDistribution
      // 按 date + rangeId 聚合：同一日期同一范围的干重求和
      const rangeIdToMid = new Map<number, number>();
      for (const r of particleRanges ?? []) {
        if (r.id != null) rangeIdToMid.set(r.id, r.mid);
      }
      const dayRows = new Map<string, { mid: number; paperWeight: number | null; sampleWeight: number | null }[]>();
      for (const r of particle ?? []) {
        if (dateFrom && r.date < dateFrom) continue;
        if (dateTo && r.date > dateTo) continue;
        const mid = r.rangeId != null ? rangeIdToMid.get(r.rangeId) ?? 0 : 0;
        const list = dayRows.get(r.date) ?? [];
        list.push({ mid, paperWeight: r.paperWeight, sampleWeight: r.sampleWeight });
        dayRows.set(r.date, list);
      }
      const data: Array<[string, number]> = [];
      for (const [d, rows] of Array.from(dayRows.entries()).sort()) {
        const dist = computeParticleDistribution(rows.map((r) => ({
          rangeId: 0,
          paperWeight: r.paperWeight,
          sampleWeight: r.sampleWeight,
          mid: r.mid,
        })));
        if (dist.d50 != null) data.push([d, dist.d50]);
      }
      return [{ name: 'd50 (μm)', data }];
    }
    // EPS
    const map = new Map<string, number[]>();
    for (const r of eps ?? []) {
      if (dateFrom && r.date < dateFrom) continue;
      if (dateTo && r.date > dateTo) continue;
      let v: number | null = null;
      if (extrasField === 'psContent') v = r.psContent;
      else if (extrasField === 'pnContent') v = r.pnContent;
      else if (extrasField === 'pnPsRatio') v = r.pnPsRatio;
      if (v == null) continue;
      const list = map.get(r.date) ?? [];
      list.push(v);
      map.set(r.date, list);
    }
    const labels: Record<ExtrasField, string> = {
      psContent: 'PS 含量 (mg/g VSS)',
      pnContent: 'PN 含量 (mg/g VSS)',
      pnPsRatio: 'PN/PS 比',
    };
    const data = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, vs]) => [d, vs.reduce((s, v) => s + v, 0) / vs.length]);
    return [{ name: labels[extrasField], data }];
  }, [mode, extrasKind, extrasField, mlss, particle, particleRanges, eps, dateFrom, dateTo]);

  // 必须在 extrasSeries 声明之后，否则切到「其他指标」模式会因 TDZ 报错白屏
  const series = mode === 'extras' ? extrasSeries : measurementSeries;

  const option = useMemo(() => {
    // 统一青绿系系列色（多罐分线按序取色，替代 ECharts 默认杂色）
    const palette = ['#0d9488', '#0f766e', '#14b8a6', '#115e59', '#2dd4bf', '#134e4a'];
    return {
      color: palette,
      tooltip: { trigger: 'axis' as const },
      legend: { data: series.map((s) => s.name), top: 0 },
      grid: { left: 50, right: 20, top: 36, bottom: 50 },
      xAxis: {
        type: 'category' as const,
        name: mode === 'daily' ? '日期' : '时间',
        nameTextStyle: { fontSize: 11 },
        axisLabel: { color: '#64748b' },
      },
      yAxis: {
        type: 'value' as const,
        name: indicator?.unit ?? 'mg/L',
        nameTextStyle: { fontSize: 11 },
        axisLabel: { color: '#64748b' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      dataZoom: [{ type: 'inside' as const }, { type: 'slider' as const, height: 16, bottom: 4 }],
      series: series.map((s) => ({
        name: s.name,
        type: 'line' as const,
        data: s.data,
        connectNulls: true,
        symbolSize: 5,
        lineStyle: { width: 2 },
      })),
    };
  }, [series, mode, indicator]);

  function toggleReactor(id: number) {
    setReactorIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  /** 从当前实例取 SVG 字符串 dataURL（svg renderer 下可用） */
  function svgDataUrl(): string | null {
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst) return null;
    try {
      return inst.getDataURL({ type: 'svg', backgroundColor: '#ffffff' }) as string;
    } catch {
      return null;
    }
  }

  /** 高清 PNG（3x）：SVG → Image → canvas → PNG，论文/PPT 用不糊 */
  function exportPng() {
    const svgUrl = svgDataUrl();
    if (!svgUrl) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 3;
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = '图表.png';
      a.click();
    };
    img.src = svgUrl;
  }

  /** SVG 矢量图（期刊投稿要求矢量，可再编辑字号/线宽） */
  function exportSvg() {
    const svgUrl = svgDataUrl();
    if (!svgUrl) return;
    const a = document.createElement('a');
    a.href = svgUrl;
    a.download = '图表.svg';
    a.click();
  }

  return (
    <div>
      <PageHeader
        title="可视化"
        desc="趋势图、周期曲线与对比分析"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportSvg}
              disabled={series.length === 0}
              className="px-3 py-1.5 text-xs rounded-md border border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300 disabled:opacity-40"
              title="SVG 矢量图（期刊投稿、Origin 可编辑）"
            >
              导出 SVG
            </button>
            <button
              type="button"
              onClick={exportPng}
              disabled={series.length === 0}
              className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white disabled:opacity-40"
              title="高清 3 倍 PNG，论文 PPT 用不糊"
            >
              导出图片
            </button>
          </div>
        }
      />

      <div className="grid md:grid-cols-[170px_minmax(0,1fr)] gap-4">
        <div className="text-xs space-y-4">
          <div>
            <div className="text-slate-500 dark:text-slate-400 mb-1.5">数据类型</div>
            <div className="space-y-1">
              <button type="button" onClick={() => setMode('daily')} className={`block w-full text-left px-2 py-1 rounded ${mode === 'daily' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 dark:text-slate-400'}`}>日常趋势</button>
              <button type="button" onClick={() => setMode('cycle')} className={`block w-full text-left px-2 py-1 rounded ${mode === 'cycle' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 dark:text-slate-400'}`}>周期曲线</button>
              <button type="button" onClick={() => setMode('overlay')} className={`block w-full text-left px-2 py-1 rounded ${mode === 'overlay' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 dark:text-slate-400'}`}>周期叠周期</button>
              <button type="button" onClick={() => { setMode('extras'); setExtrasKind('mlss'); setExtrasField('mlss'); }} className={`block w-full text-left px-2 py-1 rounded ${mode === 'extras' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 dark:text-slate-400'}`}>其他指标趋势</button>
            </div>
          </div>

          {mode === 'extras' && (
            <>
              <div>
                <div className="text-slate-500 dark:text-slate-400 mb-1.5">数据类型</div>
                <select
                  aria-label="其他指标数据类型"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1"
                  value={extrasKind}
                  onChange={(e) => {
                    const k = e.target.value as ExtrasKind;
                    setExtrasKind(k);
                    if (k === 'mlss') setExtrasField('mlss');
                    else if (k === 'particle') setExtrasField('d50');
                    else setExtrasField('psContent');
                  }}
                >
                  <option value="mlss">污泥浓度</option>
                  <option value="particle">筛分粒径（d50）</option>
                  <option value="eps">EPS（PS/PN）</option>
                </select>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400 mb-1.5">指标字段</div>
                <select
                  aria-label="其他指标字段"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1"
                  value={extrasField}
                  onChange={(e) => setExtrasField(e.target.value as ExtrasField)}
                >
                  {extrasKind === 'mlss' && (
                    <>
                      <option value="mlss">MLSS (g/L)</option>
                      <option value="mlvss">MLVSS (g/L)</option>
                    </>
                  )}
                  {extrasKind === 'particle' && <option value="d50">d50 (μm)</option>}
                  {extrasKind === 'eps' && (
                    <>
                      <option value="psContent">PS 含量 (mg/g VSS)</option>
                      <option value="pnContent">PN 含量 (mg/g VSS)</option>
                      <option value="pnPsRatio">PN/PS 比</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400 mb-1.5">日期范围</div>
                <div className="space-y-1">
                  <input type="date" className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  <input type="date" className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {mode === 'daily' && (
            <div>
              <div className="text-slate-500 dark:text-slate-400 mb-1.5">日期范围</div>
              <div className="space-y-1">
                <input type="date" className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <input type="date" className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          )}

          {mode === 'cycle' && (
            <div>
              <div className="text-slate-500 dark:text-slate-400 mb-1.5">周期</div>
              <select className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={cycleId ?? ''} onChange={(e) => setCycleId(Number(e.target.value) || null)}>
                <option value="">选择周期</option>
                {cycles?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {mode === 'overlay' && (
            <>
              <div>
                <div className="text-slate-500 dark:text-slate-400 mb-1.5">反应器</div>
                <select className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={overlayReactorId ?? ''} onChange={(e) => setOverlayReactorId(Number(e.target.value) || null)}>
                  <option value="">选择罐</option>
                  {reactors?.map((r) => (
                    <option key={r.id} value={r.id}>{r.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-slate-500 dark:text-slate-400">周期（多选对比）</div>
                  <button
                    type="button"
                    onClick={() => setOverlayCycleIds([])}
                    className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                  >
                    全选
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
                  {(cycles ?? []).map((c) => {
                    const on = overlayCycleIds.length === 0 || overlayCycleIds.includes(c.id!);
                    return (
                      <label key={c.id} className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            setOverlayCycleIds((prev) => {
                              const cur = prev.length === 0 ? (cycles ?? []).map((x) => x.id!) : prev;
                              return cur.includes(c.id!)
                                ? cur.filter((x) => x !== c.id!)
                                : [...cur, c.id!];
                            });
                          }}
                        />
                        <span className={on ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>
                          {c.name}
                        </span>
                      </label>
                    );
                  })}
                  {(!cycles || cycles.length === 0) && (
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">还没有周期数据</div>
                  )}
                </div>
              </div>
            </>
          )}

          {mode !== 'overlay' && (
            <div>
              <div className="text-slate-500 dark:text-slate-400 mb-1.5">反应器</div>
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
            <div className="text-slate-500 dark:text-slate-400 mb-1.5">指标</div>
            <select className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1" value={indicatorId ?? ''} onChange={(e) => setIndicatorId(Number(e.target.value) || null)}>
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
              <ReactECharts
                ref={chartRef}
                option={option}
                style={{ height: 380 }}
                opts={{ renderer: 'svg' }}
                notMerge
                lazyUpdate
              />
              <div className="flex gap-4 flex-wrap text-xs mt-2">
                {series.map((s) => (
                  <span key={s.name} className="text-slate-600 dark:text-slate-400">
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
