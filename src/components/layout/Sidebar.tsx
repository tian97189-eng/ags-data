import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';
import { useAppStore, resolveDark } from '../../store/useAppStore';
import { IconSun, IconMoon } from '../common/Icons';

export default function Sidebar() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const isDark = resolveDark(theme);

  return (
    <aside className="hidden md:flex w-[140px] shrink-0 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-center gap-2 mb-5 px-2">
        <span className="inline-block w-2 h-2 rounded-full bg-brand-600"></span>
        <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100">AGS 数据台</span>
      </div>
      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-2.5 py-2 text-[13px] rounded-md transition-colors ${
                  isActive
                    ? 'bg-brand-50 dark:bg-slate-800 text-brand-800 dark:text-brand-200 font-medium'
                    : 'text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      {/* 深浅色切换按钮 */}
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        title={isDark ? '切换到浅色' : '切换到深色'}
        className="flex items-center justify-center gap-1.5 mt-2 py-1.5 text-[12px] rounded-md text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
      >
        {isDark ? <IconSun size={14} /> : <IconMoon size={14} />}
        <span>{isDark ? '浅色' : '深色'}</span>
      </button>
    </aside>
  );
}