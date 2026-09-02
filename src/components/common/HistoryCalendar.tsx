import { useState, type ReactNode, useEffect } from 'react';
import DatePicker from './DatePicker';
import EmptyState from './EmptyState';

/**
 * 历史记录日历浏览：左侧月历（有数据的日期高亮），右侧选中日期的明细。
 * 比"一条条列在下面"直观，适合 MLSS / 粒径等按日期记录的工作表。
 *
 * 用法：
 * <HistoryCalendar
 *   dates={有数据的日期 Set}
 *   defaultDate={默认选中的日期（可选，通常传最新有数据那天）}
 *   countLabel={`共 ${n} 条记录`}
 * >
 *   {(date) => <当日明细 JSX（传 date 参数） />}
 * </HistoryCalendar>
 */
export default function HistoryCalendar({
  dates,
  defaultDate,
  countLabel,
  children,
}: {
  dates: Set<string>;
  defaultDate?: string;
  countLabel: string;
  children: (date: string) => ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(defaultDate ?? null);

  // 默认选中日期变化时同步（如新增记录后）
  useEffect(() => {
    if (defaultDate && defaultDate !== selected) {
      setSelected(defaultDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDate]);

  return (
    <div className="grid md:grid-cols-[240px_minmax(0,1fr)] gap-4 pb-20 md:pb-0">
      <div>
        <DatePicker value={selected ?? ''} markedDates={dates} onChange={setSelected} />
        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
          有数据的日期会高亮，点日期看当天记录
        </div>
      </div>
      <div>
        {selected ? (
          children(selected)
        ) : (
          <EmptyState title="还没有数据" desc="在上面的表单填入数据并点添加" />
        )}
      </div>
    </div>
  );
}
