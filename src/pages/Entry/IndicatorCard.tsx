import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { computeConcentration, computeCompositeValue, type ComputeStatus } from '../../lib/calibration';
import { db } from '../../db/schema';
import { formatNumber } from '../../lib/format';
import { outOfRange } from '../../lib/stats';
import { gotoMethod } from '../../lib/navBus';

export interface CellState {
  sample: string;
  dilution: string;
  dilutionOverridden: boolean;
}

const STATUS_STYLE: Record<ComputeStatus, string> = {
  ok: 'text-teal-700',
  noCurve: 'text-slate-300',
  belowLOD: 'text-amber-600',
  negative: 'text-red-600',
};

const STATUS_HINT: Record<ComputeStatus, string> = {
  ok: '',
  noCurve: '未设标曲',
  belowLOD: '未检出',
  negative: '负值',
};

export default function IndicatorCard({
  indicator,
  reactors,
  date,
  defaultBlank,
  defaultDilution,
  cells,
  curve,
  onDefaultChange,
  onCellChange,
}: {
  indicator: import('../../db/schema').Indicator;
  reactors: import('../../db/schema').Reactor[];
  date: string;
  defaultBlank: string;
  defaultDilution: string;
  cells: Record<number, CellState>;
  curve: import('../../db/schema').CalibrationCurve | null;
  onDefaultChange: (blank: string, dilution: string) => void;
  onCellChange: (reactorId: number, cell: CellState) => void;
}) {
  const isDirect = indicator.method === 'direct';
  const isComposite = indicator.compositeType === 'sumOf';

  // 当前生效标曲的使用天数（effectiveFrom 起算）
  const curveDays = useMemo(() => {
    if (!curve?.effectiveFrom) return null;
    const from = new Date(curve.effectiveFrom + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((now.getTime() - from.getTime()) / 86_400_000));
  }, [curve?.effectiveFrom]);

  // composite 指标：实时查同日的依赖指标 value，按罐聚合
  const compositeByReactor = useLiveQuery<Record<number, number | null>>(async () => {
    if (!isComposite || !indicator.compositeRefs?.length) return {};
    const refs = await db.measurements
      .where('date')
      .equals(date)
      .filter((m) => m.scene === 'daily' && indicator.compositeRefs!.includes(m.indicatorId))
      .toArray();
    const out: Record<number, number | null> = {};
    for (const r of reactors) {
      out[r.id!] = computeCompositeValue({
        indicator,
        refMeasurements: refs.filter((m) => m.reactorId === r.id),
      });
    }
    return out;
  }, [indicator.id, date, reactors.length]);

  function cellValue(r: import('../../db/schema').Reactor): { value: number | null; status: ComputeStatus } {
    const cell = cells[r.id!];
    if (!cell) return { value: null, status: 'noCurve' };
    if (isDirect) {
      const v = cell.sample === '' ? null : Number(cell.sample);
      return { value: v, status: v == null ? 'noCurve' : 'ok' };
    }
    return computeConcentration({
      sampleAbs: cell.sample === '' ? null : Number(cell.sample),
      blankAbs: defaultBlank === '' ? null : Number(defaultBlank),
      dilution: cell.dilution === '' ? null : Number(cell.dilution),
      curve,
      lod: indicator.lod,
    });
  }

  /** 回车 → 跳到同卡片下一个输入框；卡尾则跳到下一张指标卡 */
  function handleInputEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const cur = e.currentTarget;
    const card = cur.closest('[data-indicator-card]');
    const inputs = card
      ? Array.from(card.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      : [];
    const idx = inputs.indexOf(cur);
    if (idx >= 0 && idx < inputs.length - 1) {
      inputs[idx + 1].focus();
      inputs[idx + 1].select();
      return;
    }
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('[data-indicator-card]'),
    );
    const ci = card ? cards.indexOf(card as HTMLElement) : -1;
    const next = cards[ci + 1];
    const first = next?.querySelector<HTMLInputElement>('input[type="number"]');
    if (first) {
      first.focus();
      first.select();
    }
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg mb-3" data-indicator-card="true">
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-t-lg">
        <span className="text-base font-medium">{indicator.name}</span>
        <button
          type="button"
          onClick={() => gotoMethod(indicator.name)}
          className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline"
          title="查看该指标的实验方法（步骤/试剂）"
        >
          方法
        </button>
        {isComposite && (
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
            由 {indicator.compositeRefs?.length ?? 0} 个指标自动求和
          </span>
        )}
        {!isDirect && !isComposite && (
          <>
            {curve && (
              <span
                className="ml-auto text-[10px] text-slate-400 dark:text-slate-500"
                title={`当前生效标曲：k=${curve.k != null ? curve.k.toFixed(4) : '—'}，生效日 ${curve.effectiveFrom}，斜率越大灵敏度越高`}
              >
                标曲 k={curve.k != null ? curve.k.toFixed(4) : '—'} · {curve.effectiveFrom?.slice(5) ?? ''} 生效
                {curveDays != null && (curveDays === 0 ? ' · 今日生效' : ` · 已用 ${curveDays} 天`)}
              </span>
            )}
            <div className={`flex items-center gap-3 text-xs ${curve ? '' : 'ml-auto'}`}>
              <label className="flex items-center gap-1">
                <span className="text-slate-500 dark:text-slate-400">空白</span>
                <input
                  type="number"
                  step="any"
                  aria-label={`${indicator.name} 空白`}
                  className="w-20 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
                  value={defaultBlank}
                  onChange={(e) => onDefaultChange(e.target.value, defaultDilution)}
                  onKeyDown={handleInputEnter}
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-slate-500 dark:text-slate-400">稀释</span>
                <input
                  type="number"
                  step="any"
                  aria-label={`${indicator.name} 稀释`}
                  className="w-20 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
                  value={defaultDilution}
                  onChange={(e) => onDefaultChange(defaultBlank, e.target.value)}
                  onKeyDown={handleInputEnter}
                />
              </label>
            </div>
          </>
        )}
        {isDirect && (
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">仪器直读，直接填浓度</span>
        )}
      </div>

      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          <tr className="text-slate-500 dark:text-slate-400">
            <th className="text-left py-1.5 px-3 border-b border-slate-100 dark:border-slate-800 w-16">罐</th>
            {isComposite ? (
              <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">自动计算</th>
            ) : (
              <>
                <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">
                  {isDirect ? '浓度' : '吸光度'}
                </th>
                {!isDirect && (
                  <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-24">稀释</th>
                )}
              </>
            )}
            <th className="text-right py-1.5 px-3 border-b border-slate-100 dark:border-slate-800 w-24">mg/L</th>
          </tr>
        </thead>
        <tbody>
          {reactors.map((r) => {
            const cell = cells[r.id!] ?? { sample: '', dilution: defaultDilution, dilutionOverridden: false };
            const value = isComposite
              ? (compositeByReactor?.[r.id!] ?? null)
              : cellValue(r).value;
            return (
              <tr key={r.id}>
                <td className="py-1.5 px-3 border-b border-slate-50">{r.code}</td>
                {isComposite ? (
                  <td
                    className="py-1.5 px-2 border-b border-slate-50 text-slate-500 dark:text-slate-400 text-[11px]"
                    colSpan={2}
                  >
                    由三氮等指标自动算得
                  </td>
                ) : (
                  <>
                    <td className="py-1.5 px-2 border-b border-slate-50">
                      <input
                        type="number"
                        step="any"
                        aria-label={`${r.code} ${isDirect ? '浓度' : '吸光度'}`}
                        className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1"
                        value={cell.sample}
                        onChange={(e) => onCellChange(r.id!, { ...cell, sample: e.target.value })}
                        onKeyDown={handleInputEnter}
                      />
                    </td>
                    {!isDirect && (
                      <td className="py-1.5 px-2 border-b border-slate-50">
                        <input
                          type="number"
                          step="any"
                          aria-label={`${r.code} 稀释`}
                          className={`w-full border rounded px-2 py-1 ${
                            cell.dilutionOverridden
                              ? 'border-amber-400 bg-amber-50 text-amber-700'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                          value={cell.dilution}
                          title={cell.dilutionOverridden ? '单独改过稀释倍数' : undefined}
                          onChange={(e) =>
                            onCellChange(r.id!, {
                              ...cell,
                              dilution: e.target.value,
                              dilutionOverridden: e.target.value !== defaultDilution,
                            })
                          }
                          onKeyDown={handleInputEnter}
                        />
                      </td>
                    )}
                  </>
                )}
                <td
                  className={`py-1.5 px-3 border-b border-slate-50 text-right font-medium ${
                    value != null && outOfRange(value, indicator.refLow, indicator.refHigh)
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-teal-700'
                  }`}
                  title={
                    value != null && outOfRange(value, indicator.refLow, indicator.refHigh)
                      ? `超出参考范围 ${indicator.refLow ?? '—'} ~ ${indicator.refHigh ?? '—'}`
                      : undefined
                  }
                >
                  {formatNumber(value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
