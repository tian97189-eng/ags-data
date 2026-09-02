import { useEffect, useState } from 'react';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateStr(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function todayStr(): string {
  const d = new Date();
  return dateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 月历日期选择器：有录入数据（markedDates）的日期用高亮色标记。
 */
export default function DatePicker({
  value,
  markedDates,
  onChange,
}: {
  value: string;
  markedDates: Set<string>;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const init = value ? value.split('-').map(Number) : null;
  const [year, setYear] = useState(init?.[0] ?? new Date().getFullYear());
  const [month, setMonth] = useState(init ? init[1] - 1 : new Date().getMonth());

  useEffect(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      setYear(y);
      setMonth(m - 1);
    }
  }, [value]);

  const days = daysInMonth(year, month);
  const start = firstWeekday(year, month);
  const cells: (string | null)[] = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(dateStr(year, month, d));

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs flex items-center gap-2 bg-white dark:bg-slate-800 hover:border-teal-300"
      >
        <span>{value}</span>
        <span className="text-slate-400 dark:text-slate-500">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 w-64">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={prevMonth}
                className="w-6 h-6 rounded hover:bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500"
              >
                ‹
              </button>
              <span className="text-base font-medium">
                {year}年{month + 1}月
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="w-6 h-6 rounded hover:bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] text-slate-400 dark:text-slate-500 mb-1">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d == null) return <span key={`e${i}`} />;
                const marked = markedDates.has(d);
                const selected = d === value;
                const today = d === todayStr();
                return (
                  <button
                    key={d}
                    type="button"
                    data-marked={marked ? 'true' : 'false'}
                    data-selected={selected ? 'true' : 'false'}
                    title={marked ? '当天有录入数据' : undefined}
                    onClick={() => {
                      onChange(d);
                      setOpen(false);
                    }}
                    className={`h-8 rounded-md text-xs flex items-center justify-center ${
                      selected
                        ? 'bg-teal-600 text-white font-medium'
                        : marked
                        ? 'bg-teal-100 text-teal-800 font-medium'
                        : 'hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    } ${today && !selected ? 'ring-1 ring-teal-300' : ''}`}
                  >
                    {Number(d.slice(8))}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-teal-100" /> 有数据
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-teal-600" /> 选中
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
