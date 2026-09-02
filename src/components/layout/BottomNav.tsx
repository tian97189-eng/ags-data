import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex z-40">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `relative flex-1 py-2 flex flex-col items-center gap-0.5 text-[10px] transition-colors ${
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
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}