import type { Indicator, Reactor, CalibrationCurve } from '../../db/schema';
import { computeConcentration, type ComputeStatus } from '../../lib/calibration';
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
  defaultBlank,
  defaultDilution,
  cells,
  curve,
  onDefaultChange,
  onCellChange,
}: {
  indicator: Indicator;
  reactors: Reactor[];
  defaultBlank: string;
  defaultDilution: string;
  cells: Record<number, CellState>;
  curve: CalibrationCurve | null;
  onDefaultChange: (blank: string, dilution: string) => void;
  onCellChange: (reactorId: number, cell: CellState) => void;
}) {
  const isDirect = indicator.method === 'direct';

  function cellValue(r: Reactor): { value: number | null; status: ComputeStatus } {
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
    <div className="border border-slate-200 rounded-lg mb-3">
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
        <span className="text-sm font-medium">{indicator.name}</span>
        {!isDirect ? (
          <div className="flex items-center gap-3 text-xs ml-auto">
            <label className="flex items-center gap-1">
              <span className="text-slate-500">空白</span>
              <input
                type="number"
                step="any"
                aria-label={`${indicator.name} 空白`}
                className="w-20 border border-slate-200 rounded px-2 py-1 bg-white"
                value={defaultBlank}
                onChange={(e) => onDefaultChange(e.target.value, defaultDilution)}
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-500">稀释</span>
              <input
                type="number"
                step="any"
                aria-label={`${indicator.name} 稀释`}
                className="w-20 border border-slate-200 rounded px-2 py-1 bg-white"
                value={defaultDilution}
                onChange={(e) => onDefaultChange(defaultBlank, e.target.value)}
              />
            </label>
          </div>
        ) : (
          <span className="ml-auto text-[11px] text-slate-400">仪器直读，直接填浓度</span>
        )}
      </div>

      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left py-1.5 px-3 border-b border-slate-100 w-16">罐</th>
            <th className="text-left py-1.5 px-2 border-b border-slate-100">
              {isDirect ? '浓度' : '吸光度'}
            </th>
            {!isDirect && (
              <th className="text-left py-1.5 px-2 border-b border-slate-100 w-24">稀释</th>
            )}
            <th className="text-right py-1.5 px-3 border-b border-slate-100 w-24">
              {isDirect ? '' : 'mg/L'}
            </th>
          </tr>
        </thead>
        <tbody>
          {reactors.map((r) => {
            const cell = cells[r.id!] ?? { sample: '', dilution: defaultDilution, dilutionOverridden: false };
            const { value, status } = cellValue(r);
            return (
              <tr key={r.id}>
                <td className="py-1.5 px-3 border-b border-slate-50">{r.code}</td>
                <td className="py-1.5 px-2 border-b border-slate-50">
                  <input
                    type="number"
                    step="any"
                    aria-label={`${r.code} ${isDirect ? '浓度' : '吸光度'}`}
                    className="w-full border border-slate-200 rounded px-2 py-1"
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
                          : 'border-slate-200'
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
                <td
                  className={`py-1.5 px-3 border-b border-slate-50 text-right font-medium ${STATUS_STYLE[status]}`}
                  title={STATUS_HINT[status]}
                >
                  {status === 'belowLOD' && value != null ? '未检出' : formatNumber(value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
