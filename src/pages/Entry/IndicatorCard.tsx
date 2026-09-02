import { useLiveQuery } from 'dexie-react-hooks';
import { computeConcentration, computeCompositeValue, type ComputeStatus } from '../../lib/calibration';
import { db } from '../../db/schema';
import { formatNumber } from '../../lib/format';

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

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg mb-3">
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-t-lg">
        <span className="text-base font-medium">{indicator.name}</span>
        {isComposite && (
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
            由 {indicator.compositeRefs?.length ?? 0} 个指标自动求和
          </span>
        )}
        {!isDirect && !isComposite && (
          <div className="flex items-center gap-3 text-xs ml-auto">
            <label className="flex items-center gap-1">
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">空白</span>
              <input
                type="number"
                step="any"
                aria-label={`${indicator.name} 空白`}
                className="w-20 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
                value={defaultBlank}
                onChange={(e) => onDefaultChange(e.target.value, defaultDilution)}
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">稀释</span>
              <input
                type="number"
                step="any"
                aria-label={`${indicator.name} 稀释`}
                className="w-20 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
                value={defaultDilution}
                onChange={(e) => onDefaultChange(defaultBlank, e.target.value)}
              />
            </label>
          </div>
        )}
        {isDirect && (
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">仪器直读，直接填浓度</span>
        )}
      </div>

      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          <tr className="text-slate-500 dark:text-slate-400 dark:text-slate-500">
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
                    className="py-1.5 px-2 border-b border-slate-50 text-slate-500 dark:text-slate-400 dark:text-slate-500 text-[11px]"
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
                        />
                      </td>
                    )}
                  </>
                )}
                <td className="py-1.5 px-3 border-b border-slate-50 text-right font-medium text-teal-700">
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
