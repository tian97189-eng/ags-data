import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-40">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `relative flex-1 py-2.5 text-center text-xs transition-colors ${
              isActive ? 'text-brand-700 font-medium' : 'text-slate-500'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b bg-brand-600"></span>
              )}
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
