import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';

export default function Sidebar() {
  return (
    <aside className="hidden md:flex w-[140px] shrink-0 flex-col bg-white border-r border-slate-200 p-3">
      <div className="flex items-center gap-2 mb-5 px-2">
        <span className="inline-block w-2 h-2 rounded-full bg-brand-600"></span>
        <span className="text-[13px] font-medium text-slate-900">AGS 数据台</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-2.5 py-2 text-[13px] rounded-md transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-800 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}