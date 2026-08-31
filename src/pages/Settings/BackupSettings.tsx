import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { exportBackupData, backupToJson, jsonToBackup, importBackupData } from '../../lib/backup';
import { buildExportRows, buildWorkbook, type ExportFilter } from '../../lib/excel';
import { parseImportFile, buildImportTemplate, type ImportPreview } from '../../lib/importExcel';
import { saveAndShare } from '../../lib/share';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useAppStore } from '../../store/useAppStore';
import * as XLSX from 'xlsx';

function downloadText(filename: string, text: string, mime = 'application/json') {
  // 保留作为辅助（当前不再直接调用）；Excel 导出走 saveAndShare
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BackupSettings() {
  const toast = useAppStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [modeChoiceOpen, setModeChoiceOpen] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // 导出过滤条件
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pickedReactors, setPickedReactors] = useState<number[]>([]);
  const [pickedIndicators, setPickedIndicators] = useState<number[]>([]);

  // Excel 导入
  const excelFileRef = useRef<HTMLInputElement>(null);
  const [excelImport, setExcelImport] = useState<ImportPreview | null>(null);

  const counts = useLiveQuery(async () => {
    return {
      measurements: await db.measurements.count(),
      reactors: await db.reactors.count(),
      curves: await db.curves.count(),
    };
  }, []);

  const reactors = useLiveQuery(
    () => db.reactors.toArray().then((r) => r.sort((a, b) => a.sortOrder - b.sortOrder)),
    [],
  );
  const indicators = useLiveQuery(
    () => db.indicators.toArray().then((i) => i.sort((a, b) => a.sortOrder - b.sortOrder)),
    [],
  );

  // 预估会导出多少条（实时显示）
  const previewCount = useLiveQuery(async () => {
    if (!exportOpen) return 0;
    const filter: ExportFilter = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      reactorIds: pickedReactors.length ? pickedReactors : undefined,
      indicatorIds: pickedIndicators.length ? pickedIndicators : undefined,
    };
    const all = await db.measurements.toArray();
    return all.filter((m) => {
      if (filter.dateFrom && m.date < filter.dateFrom) return false;
      if (filter.dateTo && m.date > filter.dateTo) return false;
      if (filter.reactorIds && !filter.reactorIds.includes(m.reactorId)) return false;
      if (filter.indicatorIds && !filter.indicatorIds.includes(m.indicatorId)) return false;
      return true;
    }).length;
  }, [exportOpen, dateFrom, dateTo, pickedReactors, pickedIndicators]);

  function openExport() {
    setPickedReactors((reactors ?? []).map((r) => r.id!));
    setPickedIndicators((indicators ?? []).map((i) => i.id!));
    setDateFrom('');
    setDateTo('');
    setExportOpen(true);
  }

  function togglePicked(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function handleConfirmExport() {
    if (!reactors || !indicators) return;
    const filter: ExportFilter = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      reactorIds: pickedReactors.length === reactors.length ? [] : pickedReactors,
      indicatorIds: pickedIndicators.length === indicators.length ? [] : pickedIndicators,
    };
    const all = await db.measurements.toArray();
    if (all.length === 0) {
      toast('还没有数据可导出', 'warning');
      return;
    }
    const rows = await buildExportRows(all, filter);
    if (rows.length === 0) {
      toast('当前条件下没有匹配的数据', 'warning');
      return;
    }
    const wb = buildWorkbook(rows);
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const filename = `AGS数据-${stamp}.xlsx`;
    const res = await saveAndShare({
      filename,
      content: base64,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      encoding: 'base64',
    });
    setExportOpen(false);
    if (res.method === 'native') {
      toast(`已导出 ${rows.length} 条，请在分享面板选择"保存到文件"`, 'success');
    } else {
      toast(`已导出 ${rows.length} 条 Excel`, 'success');
    }
  }

  async function handleExportBackup() {
    const backup = await exportBackupData();
    const json = backupToJson(backup);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const filename = `AGS备份-${stamp}.json`;
    const res = await saveAndShare({ filename, content: json, mime: 'application/json' });
    if (res.method === 'native') {
      toast('已保存到手机 Documents 目录，请在分享面板选择"保存到文件"', 'success');
    } else {
      toast('备份已导出', 'success');
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      jsonToBackup(text);
      setPendingImport(text);
      setModeChoiceOpen(true);
    } catch {
      toast('不是有效的备份文件', 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleExcelSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const preview = await parseImportFile(file);
      setExcelImport(preview);
    } catch (err) {
      toast(`解析失败：${(err as Error).message}`, 'error');
    }
    if (excelFileRef.current) excelFileRef.current.value = '';
  }

  async function handleConfirmExcelImport() {
    if (!excelImport) return;
    const reactors = await db.reactors.toArray();
    const indicators = await db.indicators.toArray();
    const rMap = new Map(reactors.map((r) => [r.code, r]));
    const iMap = new Map(indicators.map((i) => [i.name, i]));
    let n = 0;
    for (const row of excelImport.rows) {
      if (row.status !== 'ok') continue;
      const reactor = rMap.get(row.reactorCode!);
      const indicator = iMap.get(row.indicatorName!);
      if (!reactor || !indicator || row.value == null || !row.date) continue;
      await db.measurements.add({
        scene: 'daily',
        date: row.date,
        phase: null,
        reactorId: reactor.id!,
        indicatorId: indicator.id!,
        inputType: indicator.method === 'direct' ? 'direct' : 'absorbance',
        sampleAbs: null,
        blankAbs: null,
        dilution: null,
        value: row.value,
        curveId: null,
        blankOverridden: false,
        dilutionOverridden: false,
        note: row.note || 'Excel 导入',
      });
      n++;
    }
    setExcelImport(null);
    toast(`已导入 ${n} 条测量记录`, 'success');
  }

  function handleDownloadTemplate() {
    const wb = buildImportTemplate();
    XLSX.writeFile(wb, 'AGS数据导入模板.xlsx');
  }

  async function doImport(mode: 'merge' | 'overwrite') {
    if (pendingImport == null) return;
    try {
      const backup = jsonToBackup(pendingImport);
      const report = await importBackupData(backup, mode);
      toast(
        mode === 'overwrite' ? `已覆盖导入，共 ${report.imported} 条` : `已合并导入，新增 ${report.imported} 条`,
        'success',
      );
    } catch (err) {
      toast(`导入失败：${(err as Error).message}`, 'error');
    }
    setPendingImport(null);
    setModeChoiceOpen(false);
    setConfirmOverwrite(false);
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="text-xs text-slate-500">
        当前数据：{counts?.measurements ?? 0} 条测量记录 · {counts?.reactors ?? 0} 个反应器 · {counts?.curves ?? 0} 条标曲
      </div>

      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">备份文件（用于电脑 ↔ 手机搬运数据）</div>
        <p className="text-xs text-slate-500 mb-3">备份是一个文件，包含反应器、指标、标曲和全部测量数据。手机和电脑各自保留一份，通过这个文件互相同步。</p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={handleExportBackup} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700">
            导出备份文件
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700">
            导入备份文件
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileSelected} />
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">导出 Excel</div>
        <p className="text-xs text-slate-500 mb-3">把数据（含标曲追溯、空白、稀释倍数）导出成 Excel，可选日期范围、罐和指标。</p>
        <button type="button" onClick={openExport} className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700">
          导出 Excel
        </button>
      </div>

      {/* 导出 Excel 对话框 */}
      {exportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setExportOpen(false)}
        >
          <div
            className="bg-white rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium mb-3">选择导出的数据范围</h3>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="text-slate-500 text-xs">起始日期（可留空）</span>
                <input
                  type="date"
                  className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-slate-500 text-xs">结束日期（可留空）</span>
                <input
                  type="date"
                  className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-500 text-xs">选择罐</span>
                <div className="flex gap-2 text-[11px]">
                  <button type="button" className="text-teal-700" onClick={() => setPickedReactors((reactors ?? []).map((r) => r.id!))}>全选</button>
                  <button type="button" className="text-slate-500" onClick={() => setPickedReactors([])}>清空</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(reactors ?? []).map((r) => {
                  const checked = pickedReactors.includes(r.id!);
                  return (
                    <label
                      key={r.id}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer border ${
                        checked ? 'bg-teal-50 border-teal-300 text-teal-800' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setPickedReactors((p) => togglePicked(p, r.id!))}
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
                <span className="text-slate-500 text-xs">选择指标</span>
                <div className="flex gap-2 text-[11px]">
                  <button type="button" className="text-teal-700" onClick={() => setPickedIndicators((indicators ?? []).map((i) => i.id!))}>全选</button>
                  <button type="button" className="text-slate-500" onClick={() => setPickedIndicators([])}>清空</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(indicators ?? []).map((i) => {
                  const checked = pickedIndicators.includes(i.id!);
                  return (
                    <label
                      key={i.id}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer border ${
                        checked ? 'bg-teal-50 border-teal-300 text-teal-800' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setPickedIndicators((p) => togglePicked(p, i.id!))}
                        className="hidden"
                      />
                      {i.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="text-xs text-slate-500 mb-3">
              预计导出 <span className="font-medium text-teal-700">{previewCount ?? 0}</span> 条测量记录
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                disabled={!pickedReactors.length || !pickedIndicators.length}
                className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                导出
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">导入 Excel</div>
        <p className="text-xs text-slate-500 mb-3">
          按固定列模板（日期 / 罐 / 指标 / 浓度 / 备注）上传 Excel，可一次导入多条测量记录。不识别的罐/指标会跳过并提示。
        </p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => excelFileRef.current?.click()} className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700">
            选择 Excel 文件
          </button>
          <button type="button" onClick={handleDownloadTemplate} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-500 hover:border-teal-400">
            下载模板
          </button>
          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleExcelSelected}
          />
        </div>
      </div>

      {excelImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setExcelImport(null)}>
          <div className="bg-white rounded-xl p-5 max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium mb-3">Excel 导入预览</h3>

            <div className="text-xs text-slate-600 mb-3 space-y-1">
              <div>
                共 {excelImport.totalRows} 行，<span className="text-teal-700 font-medium">{excelImport.okCount} 行可导入</span>
                {excelImport.unknownIndicatorNames.length > 0 && (
                  <span className="text-amber-600 ml-2">
                    未识别的指标：{excelImport.unknownIndicatorNames.join('、')}
                  </span>
                )}
                {excelImport.unknownReactorCodes.length > 0 && (
                  <span className="text-amber-600 ml-2">
                    未识别的罐：{excelImport.unknownReactorCodes.join('、')}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto -mx-5 px-5 mb-3">
              <table className="w-full table-fixed border-collapse text-xs min-w-[600px]">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left py-1.5 px-2 border-b border-slate-200 w-12">行</th>
                    <th className="text-left py-1.5 px-2 border-b border-slate-200">日期</th>
                    <th className="text-left py-1.5 px-2 border-b border-slate-200">罐</th>
                    <th className="text-left py-1.5 px-2 border-b border-slate-200">指标</th>
                    <th className="text-right py-1.5 px-2 border-b border-slate-200">浓度</th>
                    <th className="text-left py-1.5 px-2 border-b border-slate-200">备注</th>
                    <th className="text-left py-1.5 px-2 border-b border-slate-200">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {excelImport.rows.map((r) => (
                    <tr key={r.excelRow}>
                      <td className="py-1.5 px-2 border-b border-slate-100">{r.excelRow}</td>
                      <td className="py-1.5 px-2 border-b border-slate-100">{r.date ?? '—'}</td>
                      <td className="py-1.5 px-2 border-b border-slate-100">{r.reactorCode ?? '—'}</td>
                      <td className="py-1.5 px-2 border-b border-slate-100">{r.indicatorName ?? '—'}</td>
                      <td className="py-1.5 px-2 border-b border-slate-100 text-right">
                        {r.value ?? '—'}
                      </td>
                      <td className="py-1.5 px-2 border-b border-slate-100">{r.note}</td>
                      <td className="py-1.5 px-2 border-b border-slate-100">
                        {r.status === 'ok' ? (
                          <span className="text-teal-700">可导入</span>
                        ) : (
                          <span className="text-amber-600" title={r.statusDetail}>
                            {r.status === 'unknown_indicator' ? '指标未定义' : r.status === 'unknown_reactor' ? '罐未定义' : r.status === 'invalid_date' ? '日期无效' : '数值无效'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setExcelImport(null)} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600">
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmExcelImport}
                disabled={excelImport.okCount === 0}
                className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                确认导入 {excelImport.okCount} 条
              </button>
            </div>
          </div>
        </div>
      )}

      {modeChoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setModeChoiceOpen(false)}>
          <div className="bg-white rounded-xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium">选择导入方式</h3>
            <p className="text-xs text-slate-500 mt-2">你正在导入一个备份文件，请选择处理方式：</p>
            <div className="space-y-2 mt-3">
              <button type="button" onClick={() => doImport('merge')} className="w-full text-left px-3 py-2 text-xs rounded-md border border-slate-200 hover:border-teal-300">
                <span className="font-medium">合并导入</span>
                <span className="text-slate-500 ml-1">只新增本地没有的记录，已有数据不动（推荐）</span>
              </button>
              <button type="button" onClick={() => { setModeChoiceOpen(false); setConfirmOverwrite(true); }} className="w-full text-left px-3 py-2 text-xs rounded-md border border-slate-200 hover:border-red-300">
                <span className="font-medium text-red-600">覆盖导入</span>
                <span className="text-slate-500 ml-1">清空本地全部数据，用备份整体替换</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOverwrite}
        title="覆盖导入"
        message="覆盖导入会清空本地全部数据，再用备份文件整体替换。此操作不可撤销，请先确认已导出过当前数据的备份。"
        confirmText="覆盖导入"
        danger
        onConfirm={() => doImport('overwrite')}
        onCancel={() => setConfirmOverwrite(false)}
      />
    </div>
  );
}
