import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS, type NavItem } from './nav';
import { IconMore } from '../common/Icons';

/**
 * 手机端底部导航（固定 5 项 + 「更多」抽屉）：
 * - 固定高频项（用户指定顺序）：概览 / 录入 / 指标 / 实验 / 查询
 * - 「更多」抽屉（用户指定顺序）：周期 / 他人 / 可视 / 统计 / 设置
 * 首次使用也能一眼看到「更多」，不会漏掉藏在滚动区外的功能。
 * 桌面端（md+）由 Sidebar 展示全部导航，不受影响。
 */

const MAIN_PATHS = ['/overview', '/entry', '/extras', '/experiment', '/query'];
const MAIN_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => MAIN_PATHS.includes(i.path));
const MORE_PATHS = ['/cycle', '/other', '/chart', '/stats', '/settings'];
const MORE_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => MORE_PATHS.includes(i.path));

/** 抽屉内每个功能的说明，帮新用户理解"这是干嘛的" */
const MORE_DESC: Record<string, string> = {
  '/cycle': '一次全周期的多点采样表',
  '/other': '帮别人测的独立空间',
  '/chart': '趋势曲线 · 周期叠对比',
  '/stats': '平均值 · 去除率分析',
  '/settings': '标曲 · 回收站 · 备份',
};

export default function BottomNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const activeInMore = MORE_PATHS.includes(pathname);
  const close = () => setOpen(false);

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex z-40"
        style={{ scrollbarWidth: 'none' }}
      >
        {MAIN_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={close}
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
        <button
          type="button"
          aria-label="更多"
          onClick={() => setOpen((v) => !v)}
          className={`relative min-w-[60px] flex-shrink-0 py-2 px-2 flex flex-col items-center gap-0.5 text-[10px] leading-none transition-colors whitespace-nowrap cursor-pointer ${
            activeInMore ? 'text-brand-700 font-medium' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {activeInMore && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-b bg-brand-600"></span>
          )}
          <span className="w-full flex justify-center">
            <IconMore size={19} />
          </span>
          <span>更多</span>
        </button>
      </nav>

      {/* 更多抽屉：遮罩 + 底部面板 */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={close}>
          <div
            role="dialog"
            aria-label="更多功能"
            className="absolute bottom-[58px] left-0 right-0 mx-auto w-full bg-white dark:bg-slate-800 rounded-t-2xl shadow-xl border-t border-slate-100 dark:border-slate-700 overflow-hidden pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                全部功能
              </div>
              <button
                type="button"
                aria-label="关闭更多"
                onClick={close}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 text-base leading-none"
              >
                ✕
              </button>
            </div>
            <div className="px-5 pb-2 text-[11px] text-slate-400 dark:text-slate-500">
              周期 · 他人 · 可视 · 统计 · 设置
            </div>
            <div className="flex flex-col px-2 pt-1">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={close}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                      active
                        ? 'bg-brand-50 dark:bg-slate-700'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <span
                      className={`shrink-0 ${active ? 'text-brand-700' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      <Icon size={20} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={`block text-[13px] leading-tight ${
                          active
                            ? 'text-brand-700 font-medium'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {item.label}
                      </span>
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {MORE_DESC[item.path]}
                      </span>
                    </span>
                    {active && (
                      <span className="shrink-0 text-[10px] text-brand-700 bg-brand-50 dark:bg-slate-800 rounded-full px-2 py-0.5">
                        当前
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
