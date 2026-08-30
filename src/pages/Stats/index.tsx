import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ReactECharts from 'echarts-for-react';
import { db } from '../../db/schema';
import { removalRate, nar, mean, stdev, pearson, attainmentRate } from '../../lib/stats';
import { formatNumber, formatPercent } from '../../lib/format';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';

export default function StatsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [removalIndicatorId, setRemovalIndicatorId] = useState<number | null>(null);
  const [corrXId, setCorrXId] = useState<number | null>(null);
  const [corrYId, setCorrYId] = useState<number | null>(null);
  const [corrReactorId, setCorrReactorId] = useState<number | null>(null);

  const measurements = useLiveQuery(() => db.measurements.toArray(), []);
  const influents = useLiveQuery(() => db.influents.toArray(), []);
  const reactors = useLiveQuery(() => db.reactors.where('active').equals(true).sortBy('sortOrder'), []);
  const indicators = useLiveQuery(() => db.indicators.orderBy('sortOrder').toArray(), []);

  const inRange = (d: string) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);

  const removalRows = useMemo(() => {
    if (!removalIndicatorId) return [];
    const filtered = (measurements ?? []).filter(
      (m) => m.indicatorId === removalIndicatorId && m.scene === 'daily' && inRange(m.date),
    );
    const infFiltered = (influents ?? []).filter(
      (i) => i.indicatorId === removalIndicatorId && inRange(i.date),
    );
    const threshold = indicators?.find((i) => i.id === removalIndicatorId)?.refHigh ?? null;
    return (reactors ?? []).map((r) => {
      const outs = filtered.filter((m) => m.reactorId === r.id).map((m) => m.value).filter((v): v is number => v != null);
      const shared = infFiltered.filter((i) => i.reactorId == null).map((i) => i.value);
      const own = infFiltered.filter((i) => i.reactorId === r.id).map((i) => i.value);
      const ins = own.length ? own : shared;
      const inMean = mean(ins);
      const outMean = mean(outs);
      return {
        code: r.code,
        inMean,
        outMean,
        outStdev: stdev(outs),
        rate: removalRate(inMean, outMean),
        attainment: attainmentRate(outs, threshold, 'below'),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, influents, reactors, indicators, removalIndicatorId, dateFrom, dateTo]);

  const narRows = useMemo(() => {
    const no2 = indicators?.find((i) => i.name === '亚硝态氮');
    const no3 = indicators?.find((i) => i.name === '硝态氮');
    if (!no2 || !no3) return [];
    return (reactors ?? []).map((r) => {
      const no2Map = new Map<string, number>();
      const no3Map = new Map<string, number>();
      for (const m of measurements ?? []) {
        if (!inRange(m.date) || m.reactorId !== r.id || m.scene !== 'daily' || m.value == null) continue;
        if (m.indicatorId === no2.id) no2Map.set(m.date, m.value);
        else if (m.indicatorId === no3.id) no3Map.set(m.date, m.value);
      }
      const rates: number[] = [];
      for (const [date, v2] of no2Map) {
        const v3 = no3Map.get(date);
        const r = nar(v2, v3 ?? null);
        if (r != null) rates.push(r);
      }
      return { code: r.code, nar: mean(rates) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, reactors, indicators, dateFrom, dateTo]);

  const corr = useMemo(() => {
    if (corrXId == null || corrYId == null) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    const xMap = new Map<string, number>();
    const yMap = new Map<string, number>();
    for (const m of measurements ?? []) {
      if (m.scene !== 'daily' || m.value == null) continue;
      if (corrReactorId != null && m.reactorId !== corrReactorId) continue;
      if (!inRange(m.date)) continue;
      if (m.indicatorId === corrXId) xMap.set(m.date, m.value);
      else if (m.indicatorId === corrYId) yMap.set(m.date, m.value);
    }
    for (const [date, x] of xMap) {
      const y = yMap.get(date);
      if (y != null) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (xs.length < 3) return { points: [], r: null };
    return { points: xs.map((x, i) => [x, ys[i]]), r: pearson(xs, ys) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, corrXId, corrYId, corrReactorId, dateFrom, dateTo]);

  const corrOption = useMemo(() => {
    const xName = indicators?.find((i) => i.id === corrXId)?.name ?? 'X';
    const yName = indicators?.find((i) => i.id === corrYId)?.name ?? 'Y';
    return {
      grid: { left: 50, right: 20, top: 30, bottom: 40 },
      xAxis: { type: 'value' as const, name: xName },
      yAxis: { type: 'value' as const, name: yName },
      series: [{ type: 'scatter' as const, data: corr?.points ?? [], symbolSize: 7, itemStyle: { color: '#534AB7' } }],
    };
  }, [corr, corrXId, corrYId, indicators]);

  const corrX = indicators?.find((i) => i.id === corrXId);
  const corrY = indicators?.find((i) => i.id === corrYId);

  return (
    <div>
      <PageHeader title="统计分析" desc="去除率、亚硝积累率与相关性" />

      <div className="flex items-center gap-2 flex-wrap mb-4 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-500">从</span>
          <input type="date" className="border border-slate-200 rounded px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-500">到</span>
          <input type="date" className="border border-slate-200 rounded px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="text-sm font-medium mb-1">去除率</div>
          <div className="flex items-center gap-2 text-xs mb-3">
            <span className="text-slate-500">指标</span>
            <select className="border border-slate-200 rounded px-2 py-1" value={removalIndicatorId ?? ''} onChange={(e) => setRemovalIndicatorId(Number(e.target.value) || null)}>
              <option value="">选择指标</option>
              {indicators?.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          {removalRows.length === 0 ? (
            <div className="text-xs text-slate-400">选择指标后显示各罐去除率</div>
          ) : (
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-2 px-2 border-b border-slate-200">罐</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">进水均值</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">出水均值</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">标准差</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">达标率</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">去除率</th>
                </tr>
              </thead>
              <tbody>
                {removalRows.map((r) => (
                  <tr key={r.code}>
                    <td className="py-2 px-2 border-b border-slate-100">{r.code}</td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right">{formatNumber(r.inMean)}</td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right">{formatNumber(r.outMean)}</td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right">{formatNumber(r.outStdev)}</td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right">{formatPercent(r.attainment)}</td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right font-medium">{formatPercent(r.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-slate-200 rounded-lg p-4">
          <div className="text-sm font-medium mb-3">亚硝积累率 NAR</div>
          {narRows.length === 0 ? (
            <div className="text-xs text-slate-400">基于亚硝态氮与硝态氮同日出水计算</div>
          ) : (
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-2 px-2 border-b border-slate-200">罐</th>
                  <th className="text-right py-2 px-2 border-b border-slate-200">平均 NAR</th>
                </tr>
              </thead>
              <tbody>
                {narRows.map((r) => (
                  <tr key={r.code}>
                    <td className="py-2 px-2 border-b border-slate-100">{r.code}</td>
                    <td className="py-2 px-2 border-b border-slate-100 text-right font-medium">{formatPercent(r.nar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-slate-200 rounded-lg p-4 md:col-span-2">
          <div className="text-sm font-medium mb-3">相关性分析</div>
          <div className="flex items-center gap-2 flex-wrap text-xs mb-3">
            <span className="text-slate-500">指标 X</span>
            <select className="border border-slate-200 rounded px-2 py-1" value={corrXId ?? ''} onChange={(e) => setCorrXId(Number(e.target.value) || null)}>
              <option value="">选择</option>
              {indicators?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <span className="text-slate-500">指标 Y</span>
            <select className="border border-slate-200 rounded px-2 py-1" value={corrYId ?? ''} onChange={(e) => setCorrYId(Number(e.target.value) || null)}>
              <option value="">选择</option>
              {indicators?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <span className="text-slate-500">罐</span>
            <select className="border border-slate-200 rounded px-2 py-1" value={corrReactorId ?? ''} onChange={(e) => setCorrReactorId(Number(e.target.value) || null)}>
              <option value="">全部</option>
              {reactors?.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
            </select>
            {corr && corr.r != null && (
              <span className="ml-auto font-medium">
                相关系数 r = {formatNumber(corr.r, 3)}
              </span>
            )}
          </div>
          {!corr || corr.points.length === 0 ? (
            <EmptyState title="选择两个指标查看相关性" desc={`需要同一罐在相同日期都有 ${corrX?.name ?? 'X'} 和 ${corrY?.name ?? 'Y'} 的数据`} />
          ) : (
            <ReactECharts option={corrOption} style={{ height: 300 }} notMerge lazyUpdate />
          )}
        </div>
      </div>
    </div>
  );
}
