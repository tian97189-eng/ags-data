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
            `flex-1 py-2 text-center text-[11px] ${
              isActive ? 'text-teal-700 font-medium' : 'text-slate-500'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
