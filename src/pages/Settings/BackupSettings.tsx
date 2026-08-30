import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { exportBackupData, backupToJson, jsonToBackup, importBackupData } from '../../lib/backup';
import { buildExportRows, buildWorkbook, downloadWorkbook } from '../../lib/excel';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useAppStore } from '../../store/useAppStore';

function downloadText(filename: string, text: string, mime = 'application/json') {
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

  const counts = useLiveQuery(async () => {
    return {
      measurements: await db.measurements.count(),
      reactors: await db.reactors.count(),
      curves: await db.curves.count(),
    };
  }, []);

  async function handleExportBackup() {
    const backup = await exportBackupData();
    const json = backupToJson(backup);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    downloadText(`AGS备份-${stamp}.json`, json);
    toast('备份已导出', 'success');
  }

  async function handleExportExcel() {
    const all = await db.measurements.toArray();
    if (all.length === 0) {
      toast('还没有数据可导出', 'warning');
      return;
    }
    const rows = await buildExportRows(all);
    const wb = buildWorkbook(rows);
    downloadWorkbook(wb, 'AGS全部数据.xlsx');
    toast('已导出 Excel', 'success');
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
        <p className="text-xs text-slate-500 mb-3">把全部数据（含标曲追溯、空白、稀释倍数）导出成 Excel 表格。</p>
        <button type="button" onClick={handleExportExcel} className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700">
          导出全部数据 Excel
        </button>
      </div>

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
