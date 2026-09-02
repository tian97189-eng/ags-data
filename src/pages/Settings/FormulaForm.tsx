import { useState } from 'react';
import { saveCurve } from '../../lib/calibration';
import { evaluateFormula } from '../../lib/formula';
import { today, formatNumber } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import type { Indicator } from '../../db/schema';

const VAR_HELP: { sym: string; label: string }[] = [
  { sym: 'A', label: '检测样吸光度' },
  { sym: 'A0', label: '空白样吸光度' },
  { sym: 'D', label: '稀释倍数' },
];

export default function FormulaForm({
  indicator,
  onClose,
  onSaved,
}: {
  indicator: Indicator;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useAppStore((s) => s.toast);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [batchNo, setBatchNo] = useState('');
  const [note, setNote] = useState('');
  const [formula, setFormula] = useState('');

  // 试算区
  const [testA, setTestA] = useState('0.284');
  const [testA0, setTestA0] = useState('0.012');
  const [testD, setTestD] = useState('10');

  const testResult = (() => {
    if (!formula.trim()) return null;
    const r = evaluateFormula(formula, {
      A: Number(testA) || 0,
      A0: Number(testA0) || 0,
      D: Number(testD) || 1,
    });
    return r;
  })();

  function insertVar(sym: string) {
    setFormula((f) => f + sym);
  }

  async function save() {
    const expr = formula.trim();
    if (!expr) {
      toast('请输入公式', 'warning');
      return;
    }
    if (!effectiveFrom) {
      toast('请选择生效日期', 'warning');
      return;
    }
    // 用一组任意值验证公式可求值
    const check = evaluateFormula(expr, { A: 1, A0: 0, D: 1 });
    if (!check.ok) {
      toast(`公式有误：${check.error}`, 'error');
      return;
    }
    const result = await saveCurve({
      indicatorId: indicator.id!,
      effectiveFrom,
      k: 0,
      b: 0,
      r2: 1,
      points: [],
      batchNo: batchNo.trim(),
      note: note.trim(),
      createdAt: new Date().toISOString(),
      formulaType: 'formula',
      formula: expr,
    });
    if (!result.ok) {
      toast(result.error || '保存失败', 'error');
      return;
    }
    toast('公式标曲已保存', 'success');
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium">手动公式标曲 · {indicator.name}</h3>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          不用标液点，直接填你的换算公式；结果 = 公式(检测样吸光度 A、空白吸光度 A0、稀释倍数 D)
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">生效日期</span>
            <input
              type="date"
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">试剂批号</span>
            <input
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />
          </label>
        </div>

        <label className="block mt-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">计算公式</span>
          <input
            className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded-md px-2 py-2 font-mono text-sm"
            placeholder="例如：(6.9627*(A-A0)-0.004)*D"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
          />
        </label>

        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">插入变量：</span>
          {VAR_HELP.map((v) => (
            <button
              key={v.sym}
              type="button"
              onClick={() => insertVar(v.sym)}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:bg-slate-800 font-mono"
              title={v.label}
            >
              {v.sym} = {v.label}
            </button>
          ))}
        </div>

        <div className="mt-3 bg-slate-50 dark:bg-slate-900 rounded-md p-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-2">试算（填一组数验证公式对不对）</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-slate-400 dark:text-slate-500">检测样 A</span>
              <input
                type="number"
                step="any"
                className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
                value={testA}
                onChange={(e) => setTestA(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-slate-400 dark:text-slate-500">空白 A0</span>
              <input
                type="number"
                step="any"
                className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
                value={testA0}
                onChange={(e) => setTestA0(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-slate-400 dark:text-slate-500">稀释 D</span>
              <input
                type="number"
                step="any"
                className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
                value={testD}
                onChange={(e) => setTestD(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-2">
            {testResult == null ? (
              <span className="text-slate-400 dark:text-slate-500">输入公式后可试算</span>
            ) : testResult.ok ? (
              <span className="text-teal-700 font-medium">
                试算结果：{formatNumber(testResult.value, 4)} mg/L
              </span>
            ) : (
              <span className="text-red-600">公式有误：{testResult.error}</span>
            )}
          </div>
        </div>

        <label className="block mt-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">备注</span>
          <input
            className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 dark:text-slate-500"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
