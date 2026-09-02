import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Measurement, Influent, Indicator, Reactor, SVIRecord, EPSRecord } from '../../db/schema';
import { db } from '../../db/schema';
import PageHeader from '../../components/layout/PageHeader';
import { today } from '../../lib/format';

/**
 * 今日概览：4 张大数字统计卡 + 7 天氨氮去除率趋势缩略图。
 * 数据来源：measurements（出水）、influents（进水）、sviRecords、epsRecords。
 */
export default function OverviewPage() {
  const todayStr = today();

  const data = useLiveQuery(
    async (): Promise<{
      indicators: Indicator[];
      measurements: Measurement[];
      influents: Influent[];
      reactors: Reactor[];
      svi: SVIRecord[];
      eps: EPSRecord[];
    }> => {
      const [indicators, measurements, influents, reactors, svi, eps] = await Promise.all([
        db.indicators.toArray(),
        db.measurements.toArray(),
        db.influents.toArray(),
        db.reactors.toArray(),
        db.sviRecords.toArray(),
        db.epsRecords.toArray(),
      ]);
      return { indicators, measurements, influents, reactors, svi, eps };
    },
    [],
  );

  // 氨氮指示剂的 id
  const nh4 = useMemo(
    () => data?.indicators.find((i: Indicator) => i.name === '氨氮'),
    [data],
  );

  // 今日样本次数（出水 daily）
  const todayDailyCount = useMemo<number | null>(
    () =>
      data
        ? data.measurements.filter(
            (m: Measurement) => m.date === todayStr && m.scene === 'daily',
          ).length
        : null,
    [data, todayStr],
  );

  // 今日氨氮去除率：平均进水浓度 vs 平均出水浓度
  const todayRemoval = useMemo<number | null>(() => {
    const { measurements, influents } = data ?? {};
    if (!measurements || !influents || !nh4) return null;
    const todayOut = measurements.filter(
      (m: Measurement) =>
        m.date === todayStr && m.scene === 'daily' && m.indicatorId === nh4.id && m.value != null,
    );
    const todayIn = influents.filter(
      (i: Influent) => i.date === todayStr && i.indicatorId === nh4.id && i.value != null,
    );
    if (todayOut.length === 0 || todayIn.length === 0) return null;
    const avgIn =
      todayIn.reduce((s: number, x: Influent) => s + (x.value ?? 0), 0) / todayIn.length;
    const avgOut =
      todayOut.reduce((s: number, x: Measurement) => s + (x.value ?? 0), 0) / todayOut.length;
    if (avgIn <= 0) return null;
    return ((avgIn - avgOut) / avgIn) * 100;
  }, [data, nh4, todayStr]);

  // 最近一次 SVI30
  const latestSVI = useMemo(() => {
    const svi = data?.svi;
    if (!svi || svi.length === 0) return null;
    const sorted = [...svi].sort((a, b) => (a.date < b.date ? 1 : -1));
    return { value: sorted[0].svi30, date: sorted[0].date };
  }, [data]);

  // 最近一次 PN/PS
  const latestPNPS = useMemo(() => {
    const eps = data?.eps;
    if (!eps || eps.length === 0) return null;
    const sorted = [...eps].sort((a, b) => (a.date < b.date ? 1 : -1));
    return { value: sorted[0].pnPsRatio, date: sorted[0].date };
  }, [data]);

  // 近 7 天每日氨氮去除率（每个反应器一条线）
  const removalTrend = useMemo(() => {
    const { measurements, influents } = data ?? {};
    if (!measurements || !influents || !nh4 || !data?.reactors) return null;
    const reactors = data.reactors;
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const tanks = reactors.filter((r: Reactor) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
    const dayData: { date: string; values: (number | null)[] }[] = dates.map((d) => {
      const inV = influents
        .filter((i: Influent) => i.date === d && i.indicatorId === nh4.id && i.value != null)
        .reduce((s: number, x: Influent) => s + (x.value ?? 0), 0);
      const inN = influents.filter(
        (i: Influent) => i.date === d && i.indicatorId === nh4.id && i.value != null,
      ).length;
      const avgIn = inN > 0 ? inV / inN : 0;
      const values = tanks.map((r: Reactor) => {
        const out = measurements.find(
          (m: Measurement) =>
            m.date === d &&
            m.scene === 'daily' &&
            m.reactorId === r.id &&
            m.indicatorId === nh4.id &&
            m.value != null,
        );
        const outV = out?.value;
        if (outV == null || avgIn <= 0) return null;
        return ((avgIn - outV) / avgIn) * 100;
      });
      return { date: d, values };
    });
    return { dates, tanks: tanks.map((t) => t.code), data: dayData };
  }, [data, nh4]);

  return (
    <div>
      <PageHeader title="今日概览" desc={`${todayStr} · 一天的数据都聚在这一页`} />

      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <StatCard label="氨氮去除率" value={todayRemoval} suffix="%" precision={1} accent />
        <StatCard
          label="SVI30"
          value={latestSVI?.value ?? null}
          suffix=" mL/g"
          precision={1}
          subLabel={latestSVI?.date}
        />
        <StatCard
          label="今日样本次数"
          value={todayDailyCount}
          suffix=" 次"
          precision={0}
        />
        <StatCard
          label="PN/PS 比"
          value={latestPNPS?.value ?? null}
          precision={2}
          subLabel={latestPNPS?.date}
        />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-medium">氨氮去除率 · 近 7 天</span>
          {removalTrend && (
            <span className="flex gap-3 text-[13px] text-slate-500 dark:text-slate-400">
              {removalTrend.tanks.map((c, i) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-1.5 rounded-full"
                    style={{ background: ['#0d9488', '#14b8a6', '#99f6e4', '#115e59', '#2dd4bf'][i % 5] }}
                  />
                  {c}
                </span>
              ))}
            </span>
          )}
        </div>
        <TrendChart trend={removalTrend} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  precision = 1,
  subLabel,
  accent = false,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  precision?: number;
  subLabel?: string;
  accent?: boolean;
}) {
  const display =
    value == null
      ? '—'
      : precision === 0
        ? Math.round(value).toString()
        : value.toFixed(precision);
  return (
    <div
      className={`rounded-lg p-4 ${accent ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 shadow-card'}`}
    >
      <div
        className={`text-[13px] ${accent ? 'text-brand-100' : 'text-slate-500 dark:text-slate-400'}`}
      >
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={`tabular-nums ${
            accent ? 'text-white' : 'text-slate-900 dark:text-slate-100'
          } text-[26px] font-medium leading-none`}
        >
          {display}
        </span>
        {suffix && (
          <span
            className={`text-[13px] ${accent ? 'text-brand-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {suffix.trim()}
          </span>
        )}
      </div>
      {subLabel && (
        <div
          className={`text-[11px] mt-1 ${accent ? 'text-brand-100' : 'text-slate-400 dark:text-slate-500'}`}
        >
          {subLabel}
        </div>
      )}
    </div>
  );
}

function TrendChart({
  trend,
}: {
  trend: { dates: string[]; tanks: string[]; data: { date: string; values: (number | null)[] }[] } | null;
}) {
  if (!trend || trend.data.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-[13px] text-slate-400 dark:text-slate-500">
        暂无数据
      </div>
    );
  }
  const W = 600;
  const H = 90;
  const padX = 4;
  const padY = 8;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  // Y 轴固定 0~100%，超出范围裁剪到边界
  const xFor = (i: number) => padX + (i / (trend.data.length - 1 || 1)) * innerW;
  const yFor = (v: number) => padY + (1 - Math.max(0, Math.min(100, v)) / 100) * innerH;
  const colors = ['#0d9488', '#14b8a6', '#99f6e4', '#115e59', '#2dd4bf'];
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="text-brand-600"
    >
      {[0, 25, 50, 75, 100].map((g) => (
        <line
          key={g}
          x1={padX}
          y1={yFor(g)}
          x2={W - padX}
          y2={yFor(g)}
          stroke="#f1f5f9"
          strokeWidth="1"
        />
      ))}
      {trend.tanks.map((_, ti) => {
        const pts = trend.data
          .map((d, di) => ({ x: xFor(di), y: yFor(d.values[ti] ?? 0), v: d.values[ti] }))
          .filter((p) => true);
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        return (
          <path
            key={ti}
            d={path}
            fill="none"
            stroke={colors[ti % colors.length]}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}