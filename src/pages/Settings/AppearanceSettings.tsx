import { useAppStore, type Theme } from '../../store/useAppStore';

const OPTIONS: { value: Theme; label: string; desc: string }[] = [
  { value: 'light', label: '浅色', desc: '白底深字，白天/实验室照明下更清晰' },
  { value: 'dark', label: '深色', desc: '黑底浅字，夜间或暗室观色更省眼' },
  { value: 'system', label: '跟随系统', desc: '自动跟手机的深浅色设置（默认）' },
];

/** 设置页「外观」：浅色/深色/跟随系统 三选一（手机端也能切，不再依赖侧边栏按钮） */
export default function AppearanceSettings() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <div className="max-w-md">
      <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        选择界面颜色：浅色适合白天，深色适合暗处，跟随系统则和手机设置一致。
      </div>
      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 cursor-pointer text-sm ${
              theme === o.value
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-500/10'
                : 'border-slate-200 dark:border-slate-600'
            }`}
          >
            <input
              type="radio"
              name="appearance"
              className="accent-teal-600"
              checked={theme === o.value}
              onChange={() => setTheme(o.value)}
            />
            <span className="flex-1">
              <span className="block text-slate-800 dark:text-slate-100">{o.label}</span>
              <span className="block text-[11px] text-slate-400">{o.desc}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-3">选择后立即生效，偏好会保存在本机。</p>
    </div>
  );
}
