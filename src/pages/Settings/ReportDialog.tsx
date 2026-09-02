import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { collectReportData } from '../../lib/report';
import { renderTrendCharts } from '../../lib/reportCharts';
import { buildDocx } from '../../lib/reportDocx';
import { saveAndShare } from '../../lib/share';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ReportDialog({ open, onClose }: Props) {
  const toast = useAppStore((s) => s.toast);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [pickedReactors, setPickedReactors] = useState<number[]>([]);
  const [pickedIndicators, setPickedIndicators] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const initializedRef = useRef(false);

  const reactors = useLiveQuery(
    () => db.reactors.toArray().then((r) => r.filter((x) => x.active).sort((a, b) => a.sortOrder - b.sortOrder)),
    [],
  );
  const indicators = useLiveQuery(
    () => db.indicators.toArray().then((i) => i.filter((x) => x.active).sort((a, b) => a.sortOrder - b.sortOrder)),
    [],
  );

  // 每次打开时重置：默认本月，罐/指标全选
  useEffect(() => {
    if (open) {
      initializedRef.current = false;
      setDateFrom(firstOfMonth());
      setDateTo(today());
    }
  }, [open]);

  useEffect(() => {
    if (open && !initializedRef.current && reactors && indicators) {
      initializedRef.current = true;
      setPickedReactors((reactors ?? []).map((r) => r.id!));
      setPickedIndicators((indicators ?? []).map((i) => i.id!));
    }
  }, [open, reactors, indicators]);

  // 预计统计条数（日常数据）
  const previewCount = useLiveQuery(async () => {
    if (!open || !pickedReactors.length || !pickedIndicators.length) return null;
    const all = await db.measurements.toArray();
    return all.filter(
      (m) =>
        m.scene === 'daily' &&
        m.value != null &&
        m.date >= dateFrom &&
        m.date <= dateTo &&
        pickedReactors.includes(m.reactorId) &&
        pickedIndicators.includes(m.indicatorId),
    ).length;
  }, [open, dateFrom, dateTo, pickedReactors, pickedIndicators]);

  function toggle(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function handleGenerate() {
    if (generating) return;
    if (!pickedReactors.length || !pickedIndicators.length) {
      toast('请至少选择一个罐和一个指标', 'warning');
      return;
    }
    if (dateFrom > dateTo) {
      toast('起始日期不能晚于结束日期', 'warning');
      return;
    }
    setGenerating(true);
    try {
      const data = await collectReportData({
        dateFrom,
        dateTo,
        reactorIds: pickedReactors,
        indicatorIds: pickedIndicators,
      });
      if (data.dailyCount === 0) {
        toast('该时间段内没有日常数据，无法生成报告', 'warning');
        return;
      }
      // 趋势图（每指标一张；无数据的指标返回 null 自动跳过）
      const charts = await renderTrendCharts(data);
      const { base64, filename } = await buildDocx(data, charts);
      const res = await saveAndShare({
        filename,
        content: base64,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        encoding: 'base64',
      });
      if (res.method === 'native') {
        toast(`报告已生成（${data.dailyCount} 条数据），请在分享面板选择"保存到文件"`, 'success');
      } else {
        toast(`报告已生成（${data.dailyCount} 条数据）`, 'success');
      }
      onClose();
    } catch (err) {
      toast(`生成失败：${(err as Error).message}`, 'error');
    } finally {
      setGenerating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium mb-3">生成 Word 实验报告</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          按选定的时间段、罐和指标，生成一份带统计表（平均值 / 标准差 / 去除率 / 亚硝积累率）和趋势图的 Word 报告。
          只统计日常数据，全周期数据不混入。
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">起始日期</span>
            <input
              type="date"
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 text-xs">结束日期</span>
            <input
              type="date"
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-500 dark:text-slate-400 text-xs">选择罐</span>
            <div className="flex gap-2 text-[11px]">
              <button type="button" className="text-teal-700" onClick={() => setPickedReactors((reactors ?? []).map((r) => r.id!))}>全选</button>
              <button type="button" className="text-slate-500 dark:text-slate-400" onClick={() => setPickedReactors([])}>清空</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(reactors ?? []).map((r) => {
              const checked = pickedReactors.includes(r.id!);
              return (
                <label
                  key={r.id}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer border ${
                    checked ? 'bg-teal-50 border-teal-300 text-teal-800' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setPickedReactors((p) => toggle(p, r.id!))}
                    className="hidden"
                  />
                  {r.code}
                </label>
              );
            })}
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-500 dark:text-slate-400 text-xs">选择指标</span>
            <div className="flex gap-2 text-[11px]">
              <button type="button" className="text-teal-700" onClick={() => setPickedIndicators((indicators ?? []).map((i) => i.id!))}>全选</button>
              <button type="button" className="text-slate-500 dark:text-slate-400" onClick={() => setPickedIndicators([])}>清空</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(indicators ?? []).map((i) => {
              const checked = pickedIndicators.includes(i.id!);
              return (
                <label
                  key={i.id}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer border ${
                    checked ? 'bg-teal-50 border-teal-300 text-teal-800' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setPickedIndicators((p) => toggle(p, i.id!))}
                    className="hidden"
                  />
                  {i.name}
                  {i.method === 'direct' && <span className="text-[10px] text-slate-400 dark:text-slate-500">直读</span>}
                  {i.compositeType === 'sumOf' && <span className="text-[10px] text-slate-400 dark:text-slate-500">自动求和</span>}
                </label>
              );
            })}
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          预计统计：<span className="font-medium text-teal-700">{previewCount ?? 0}</span> 条日常数据
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !pickedReactors.length || !pickedIndicators.length}
            className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {generating ? '生成中…' : '生成报告'}
          </button>
        </div>
      </div>
    </div>
  );
}
