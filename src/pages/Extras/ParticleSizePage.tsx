import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ParticleSizeRange } from '../../db/schema';
import { computeParticleDistribution } from '../../lib/extras';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import EmptyState from '../../components/common/EmptyState';

/** 筛分粒径：
 *  - 顶部：粒径范围配置（用户增删改）—— 每段含 from/to/中位径
 *  - 中部：每日录入"该日期各段的滤纸重 M1 + 滤纸+泥重 M2"
 *  - 自动算：每段泥重 = M2-M1，占比 %，中位径贡献；以及整组的 d50（加权累计到 50% 处的粒径）
 */

const DEFAULT_RANGES: Omit<ParticleSizeRange, 'id'>[] = [
  { from: 355, to: Number.POSITIVE_INFINITY, mid: 525, sortOrder: 1 }, // >355 代表值 525
  { from: 200, to: 355, mid: 277.5, sortOrder: 2 },
  { from: 150, to: 200, mid: 175, sortOrder: 3 },
  { from: 100, to: 150, mid: 125, sortOrder: 4 },
  { from: 50, to: 100, mid: 75, sortOrder: 5 },
  { from: 0, to: 50, mid: 25, sortOrder: 6 },
];

function rangeLabel(r: ParticleSizeRange): string {
  if (!isFinite(r.to)) return `>${r.from} μm`;
  if (r.from === 0) return `<${r.to} μm`;
  return `${r.from}-${r.to} μm`;
}

export default function ParticleSizePage() {
  const toast = useAppStore((s) => s.toast);
  const ranges = useLiveQuery(
    () => db.particleSizeRanges.orderBy('sortOrder').toArray(),
    [],
  );
  const records = useLiveQuery(
    () => db.particleSizeRecords.orderBy('date').reverse().toArray(),
    [],
  );

  // 首次使用：填充默认范围
  useEffect(() => {
    if (ranges != null && ranges.length === 0) {
      void db.particleSizeRanges.bulkAdd(DEFAULT_RANGES);
    }
  }, [ranges]);

  async function handleAddRange() {
    const lastSort = (ranges && ranges.length ? Math.max(...ranges.map((r) => r.sortOrder)) : 0) + 1;
    await db.particleSizeRanges.add({ from: 0, to: 100, mid: 50, sortOrder: lastSort });
  }

  async function handleUpdateRange(r: ParticleSizeRange, patch: Partial<ParticleSizeRange>) {
    await db.particleSizeRanges.update(r.id!, patch);
  }

  async function handleDeleteRange(r: ParticleSizeRange) {
    await db.particleSizeRanges.delete(r.id!);
  }

  // 按日期分组当前选中日期的所有记录
  const [date, setDate] = useState(today());
  const dayRecords = (records ?? []).filter((r) => r.date === date);
  const rowInputs = (ranges ?? []).map((rng) => {
    const rec = dayRecords.find((r) => r.rangeId === rng.id);
    return {
      rangeId: rng.id!,
      paperWeight: rec?.paperWeight ?? null,
      sampleWeight: rec?.sampleWeight ?? null,
      mid: rng.mid,
    };
  });
  const dist = computeParticleDistribution(rowInputs);

  async function handleSaveRow(rangeId: number, paperWeight: number | null, sampleWeight: number | null) {
    const existing = dayRecords.find((r) => r.rangeId === rangeId);
    // 单行泥重 = 烘干后（滤纸+泥）− 烘干滤纸
    const dry =
      paperWeight != null && sampleWeight != null && sampleWeight > paperWeight
        ? sampleWeight - paperWeight
        : null;
    if (dry == null) {
      if (existing?.id) await db.particleSizeRecords.delete(existing.id);
      return;
    }
    const total = (dist.dryWeights ?? []).reduce<number>((s, w) => s + (w ?? 0), 0);
    const percentVal = total > 0 ? (dry / total) * 100 : 0;
    const rng = (ranges ?? []).find((r) => r.id === rangeId);
    const mid = rng?.mid ?? 0;
    const contribVal = (percentVal * mid) / 100;
    if (existing?.id) {
      await db.particleSizeRecords.update(existing.id, {
        paperWeight, sampleWeight, dryWeight: dry, percent: percentVal, contribution: contribVal,
      });
    } else {
      await db.particleSizeRecords.add({
        date, reactorId: null, rangeId,
        paperWeight, sampleWeight, dryWeight: dry, percent: percentVal, contribution: contribVal,
        note: '', createdAt: new Date().toISOString(),
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium">粒径范围配置</div>
          <button type="button" onClick={handleAddRange} className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700">
            + 新增段
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">默认 6 段（&gt;355 / 200-355 / 150-200 / 100-150 / 50-100 / &lt;50）。每段可改下限/上限/中位径。</p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left py-1.5 px-2 border-b border-slate-200 w-16">下限</th>
              <th className="text-left py-1.5 px-2 border-b border-slate-200 w-16">上限</th>
              <th className="text-left py-1.5 px-2 border-b border-slate-200 w-20">中位径</th>
              <th className="text-left py-1.5 px-2 border-b border-slate-200">区间</th>
              <th className="text-right py-1.5 px-2 border-b border-slate-200 w-16">操作</th>
            </tr>
          </thead>
          <tbody>
            {(ranges ?? []).map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 px-2 border-b border-slate-100">
                  <input
                    type="number" step="any"
                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs"
                    value={r.from}
                    onChange={(e) => handleUpdateRange(r, { from: Number(e.target.value) })}
                  />
                </td>
                <td className="py-1.5 px-2 border-b border-slate-100">
                  <input
                    type="number" step="any"
                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs"
                    value={isFinite(r.to) ? r.to : ''}
                    placeholder="∞"
                    onChange={(e) => handleUpdateRange(r, { to: e.target.value === '' ? Number.POSITIVE_INFINITY : Number(e.target.value) })}
                  />
                </td>
                <td className="py-1.5 px-2 border-b border-slate-100">
                  <input
                    type="number" step="any"
                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs"
                    value={r.mid}
                    onChange={(e) => handleUpdateRange(r, { mid: Number(e.target.value) })}
                  />
                </td>
                <td className="py-1.5 px-2 border-b border-slate-100 text-slate-500">
                  {rangeLabel(r)}
                </td>
                <td className="py-1.5 px-2 border-b border-slate-100 text-right">
                  <button type="button" onClick={() => handleDeleteRange(r)} className="text-red-600">
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-sm font-medium">当日测量</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-200 rounded-md px-2 py-1 text-xs"
          />
          <span className="ml-auto text-xs text-slate-600">
            平均粒径 d50 = <span className="font-mono text-teal-700 font-medium">{dist.d50?.toFixed(2) ?? '—'}</span> μm
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-3">填滤纸重 M1 和滤纸+泥重 M2。泥重 = M2 − M1，占比% = 泥重 / 总泥重 × 100。</p>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full table-fixed border-collapse text-xs min-w-[640px]">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left py-1.5 px-2 border-b border-slate-100">粒径区间</th>
                <th className="text-left py-1.5 px-2 border-b border-slate-100 w-20">M1 滤纸</th>
                <th className="text-left py-1.5 px-2 border-b border-slate-100 w-20">M2 滤纸+泥</th>
                <th className="text-right py-1.5 px-2 border-b border-slate-100 w-20">泥重</th>
                <th className="text-right py-1.5 px-2 border-b border-slate-100 w-16">占比</th>
                <th className="text-right py-1.5 px-2 border-b border-slate-100 w-20">加权</th>
              </tr>
            </thead>
            <tbody>
              {(ranges ?? []).map((rng, idx) => {
                const rec = dayRecords.find((r) => r.rangeId === rng.id);
                return (
                  <tr key={rng.id}>
                    <td className="py-1.5 px-2 border-b border-slate-50">{rangeLabel(rng)}</td>
                    <td className="py-1.5 px-2 border-b border-slate-50">
                      <input
                        type="number" step="any"
                        aria-label={`${rangeLabel(rng)} 滤纸重`}
                        className="w-full border border-slate-200 rounded px-1.5 py-1"
                        value={rec?.paperWeight ?? ''}
                        onChange={(e) => {
                          const pw = e.target.value === '' ? null : Number(e.target.value);
                          handleSaveRow(rng.id!, pw, rec?.sampleWeight ?? null);
                        }}
                      />
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50">
                      <input
                        type="number" step="any"
                        aria-label={`${rangeLabel(rng)} 滤纸+泥`}
                        className="w-full border border-slate-200 rounded px-1.5 py-1"
                        value={rec?.sampleWeight ?? ''}
                        onChange={(e) => {
                          const sw = e.target.value === '' ? null : Number(e.target.value);
                          handleSaveRow(rng.id!, rec?.paperWeight ?? null, sw);
                        }}
                      />
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                      {dist.dryWeights[idx]?.toFixed(4) ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">
                      {dist.percents[idx] != null ? `${dist.percents[idx]!.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-50 text-right">
                      {dist.contributions[idx]?.toFixed(4) ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}