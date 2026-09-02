import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';

/**
 * 手机端底部导航：10 项窄屏横向可滚动，每项 60px 最小宽度，标签永不换行。
 * 4 字标签已缩短为 2~3 字以避免视觉拥挤（"其他指标"→"指标" / "统计分析"→"统计"）。
 */
export default function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex z-40 overflow-x-auto overflow-y-hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `relative min-w-[60px] flex-shrink-0 py-2 px-2 flex flex-col items-center gap-0.5 text-[10px] leading-none transition-colors whitespace-nowrap ${
                isActive ? 'text-brand-700 font-medium' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-b bg-brand-600"></span>
                )}
                <Icon size={18} />
                <span className="truncate max-w-[56px]">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
