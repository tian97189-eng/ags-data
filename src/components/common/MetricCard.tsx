export default function MetricCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 sm:p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{label}</div>
      <div className="text-xl sm:text-2xl font-medium mt-1">
        {value}
        {unit && <span className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
