import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';

export default function Sidebar() {
  return (
    <aside className="hidden md:flex w-[118px] shrink-0 flex-col bg-white border-r border-slate-200 p-3">
      <div className="text-sm font-medium mb-4 px-2 flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-600"></span>
        AGS 数据台
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `px-2 py-1.5 text-sm rounded-md transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-800 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
