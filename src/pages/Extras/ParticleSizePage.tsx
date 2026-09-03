import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ParticleSizeRange } from '../../db/schema';
import { computeParticleDistribution, midOfRange } from '../../lib/extras';
import { useAppStore } from '../../store/useAppStore';
import { today } from '../../lib/format';
import HistoryCalendar from '../../components/common/HistoryCalendar';
import { trashRows } from '../../lib/trash';

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

/** 中位径 = 上下限平均值；最后一段（to=∞）需手动给代表值（如 525） */
function rangeLabel(r: ParticleSizeRange): string {
  if (!isFinite(r.to)) return `>${r.from} μm`;
  if (r.from === 0) return `<${r.to} μm`;
  return `${r.from}-${r.to} μm`;
}

export default function ParticleSizePage({ onOpenSOP }: { onOpenSOP?: () => void }) {
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
    // 中位径自动算：改了上下限 → mid = (from+to)/2（to=∞ 时保留手动代表值）
    const next = { ...r, ...patch };
    const auto = midOfRange(next.from, next.to);
    if (auto != null) patch.mid = auto;
    await db.particleSizeRanges.update(r.id!, patch);
  }

  async function handleDeleteRange(r: ParticleSizeRange) {
    const row = await db.particleSizeRanges.get(r.id!);
    if (row) await trashRows('particleSizeRanges', [row]);
    await db.particleSizeRanges.delete(r.id!);
  }

  async function handleDeleteRecord(id: number) {
    const row = await db.particleSizeRecords.get(id);
    if (row) await trashRows('particleSizeRecords', [row]);
    await db.particleSizeRecords.delete(id);
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
    // 单行泥重 = 烘干后（滤纸+泥）− 烘干滤纸；两者都填且泥重为正才算
    const dry =
      paperWeight != null && sampleWeight != null && sampleWeight > paperWeight
        ? sampleWeight - paperWeight
        : null;
    // 记录始终保留用户已填的 M1/M2（允许只填一个），不因 dry=null 删除
    const rng = (ranges ?? []).find((r) => r.id === rangeId);
    const mid = rng?.mid ?? 0;
    const total = (dist.dryWeights ?? []).reduce<number>((s, w) => s + (w ?? 0), 0);
    const percentVal = dry != null && total > 0 ? (dry / total) * 100 : null;
    const contribVal = percentVal != null ? (percentVal * mid) / 100 : null;
    const payload = {
      paperWeight, sampleWeight,
      dryWeight: dry, percent: percentVal, contribution: contribVal,
    };
    if (paperWeight == null && sampleWeight == null) {
      // 两个都清空 → 删掉该行记录
      if (existing?.id) await db.particleSizeRecords.delete(existing.id);
      return;
    }
    if (existing?.id) {
      await db.particleSizeRecords.update(existing.id, payload);
    } else {
      await db.particleSizeRecords.add({
        date, reactorId: null, rangeId,
        ...payload, note: '', createdAt: new Date().toISOString(),
      });
    }
  }

  return (
    <div className="space-y-4">
      {onOpenSOP && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenSOP}
            className="px-3 py-1.5 text-xs rounded-lg border border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors"
          >
            📖 查看操作步骤（筛粒径 SOP）
          </button>
        </div>
      )}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-base font-medium">粒径范围配置</div>
          <button type="button" onClick={handleAddRange} className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">
            + 新增段
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">默认 6 段（&gt;355 / 200-355 / 150-200 / 100-150 / 50-100 / &lt;50）。中位径自动 = 上下限平均值；只有最后一段（&gt;N，无上限）需要手填代表值。</p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-slate-500 dark:text-slate-400">
              <th className="text-left py-1.5 px-2 border-b border-slate-200 dark:border-slate-700 w-16">下限</th>
              <th className="text-left py-1.5 px-2 border-b border-slate-200 dark:border-slate-700 w-16">上限</th>
              <th className="text-left py-1.5 px-2 border-b border-slate-200 dark:border-slate-700 w-24">中位径</th>
              <th className="text-left py-1.5 px-2 border-b border-slate-200 dark:border-slate-700">区间</th>
              <th className="text-right py-1.5 px-2 border-b border-slate-200 dark:border-slate-700 w-16">操作</th>
            </tr>
          </thead>
          <tbody>
            {(ranges ?? []).map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">
                  <input
                    type="number" step="any"
                    className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs"
                    value={r.from}
                    onChange={(e) => handleUpdateRange(r, { from: Number(e.target.value) })}
                  />
                </td>
                <td className="py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">
                  <input
                    type="number" step="any"
                    className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs"
                    value={isFinite(r.to) ? r.to : ''}
                    placeholder="∞"
                    onChange={(e) => handleUpdateRange(r, { to: e.target.value === '' ? Number.POSITIVE_INFINITY : Number(e.target.value) })}
                  />
                </td>
                <td className="py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">
                  {isFinite(r.to) ? (
                    // 有上限：自动算 (from+to)/2，只读
                    <div className="px-1.5 py-1 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 rounded tabular-nums">
                      {midOfRange(r.from, r.to)?.toFixed(1) ?? '—'}
                    </div>
                  ) : (
                    // 无上限（>N）：手填代表值
                    <input
                      type="number" step="any"
                      className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs"
                      value={r.mid}
                      onChange={(e) => handleUpdateRange(r, { mid: Number(e.target.value) })}
                    />
                  )}
                </td>
                <td className="py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  {rangeLabel(r)}
                </td>
                <td className="py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 text-right">
                  <button type="button" onClick={() => handleDeleteRange(r)} className="text-red-600">
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-base font-medium">当日测量</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs"
          />
          <span className="ml-auto text-xs text-slate-600 dark:text-slate-400">
            平均粒径 d50 = <span className="font-mono text-teal-700 font-medium">{dist.d50?.toFixed(2) ?? '—'}</span> μm
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">填滤纸重 M1 和滤纸+泥重 M2（可只填一个，会自动保存）。泥重 = M2 − M1，占比% = 泥重 / 总泥重 × 100。</p>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full table-fixed border-collapse text-xs min-w-[640px]">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">粒径区间</th>
                <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">M1 滤纸</th>
                <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">M2 滤纸+泥</th>
                <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">泥重</th>
                <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">占比</th>
                <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">加权</th>
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
                        className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1"
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
                        className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1"
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

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-3">历史记录（{records?.length ?? 0} 条）</div>
        <HistoryCalendar
          dates={new Set((records ?? []).map((r) => r.date))}
          defaultDate={(records ?? [])[0]?.date}
          countLabel={`共 ${records?.length ?? 0} 条记录`}
        >
          {(d) => {
            const dayRecs = (records ?? []).filter((r) => r.date === d);
            if (dayRecs.length === 0) {
              return (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                  {d} 没有记录
                </div>
              );
            }
            const dayInputs = dayRecs.map((rec) => ({
              rangeId: rec.rangeId,
              paperWeight: rec.paperWeight,
              sampleWeight: rec.sampleWeight,
              mid: (ranges ?? []).find((x) => x.id === rec.rangeId)?.mid ?? 0,
            }));
            const dayDist = computeParticleDistribution(dayInputs);
            return (
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {d} · {dayRecs.length} 条 · d50 ={' '}
                  <span className="font-mono text-teal-700">{dayDist.d50?.toFixed(2) ?? '—'}</span> μm
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-xs min-w-[480px]">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="text-left py-1.5 px-2 border-b border-slate-100 dark:border-slate-800">区间</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">M1</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-20">M2</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">泥重</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-16">占比</th>
                        <th className="text-right py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 w-12">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayRecs.map((rec, idx) => (
                        <tr key={rec.id}>
                          <td className="py-1.5 px-2 border-b border-slate-50">
                            {rangeLabel((ranges ?? []).find((x) => x.id === rec.rangeId)!)}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">{rec.paperWeight?.toFixed(4) ?? '—'}</td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">{rec.sampleWeight?.toFixed(4) ?? '—'}</td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right font-medium text-teal-700">
                            {dayDist.dryWeights[idx]?.toFixed(4) ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">
                            {dayDist.percents[idx] != null ? `${dayDist.percents[idx]!.toFixed(2)}%` : '—'}
                          </td>
                          <td className="py-1.5 px-2 border-b border-slate-50 text-right">
                            <button
                              type="button"
                              className="text-red-600"
                              onClick={() => handleDeleteRecord(rec.id!)}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }}
        </HistoryCalendar>
      </div>
    </div>
  );
}