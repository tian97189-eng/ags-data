import { useEffect, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/common/ErrorBoundary';
import EntryPage from './pages/Entry';
import CyclePage from './pages/Cycle';
import QueryPage from './pages/Query';
import ExtrasPage from './pages/Extras';
import ChartPage from './pages/Chart';
import StatsPage from './pages/Stats';
import SettingsPage from './pages/Settings';
import OverviewPage from './pages/Overview';
import OtherEntryPage from './pages/OtherEntry';
import ExperimentPage from './pages/Experiment';
import { useAppStore, resolveDark } from './store/useAppStore';
import { db } from './db/schema';
import { checkUpdate, shouldAutoCheck } from './lib/updater';
import { purgeExpiredTrash } from './lib/trash';

export default function App() {
  const toast = useAppStore((s) => s.toast);
  const theme = useAppStore((s) => s.theme);

  // 启动时清理回收站中超过 30 天的记录（静默，不打扰）
  useEffect(() => {
    void purgeExpiredTrash(30);
  }, []);

  // 主题应用到 <html> 的 dark class
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      if (resolveDark(theme)) root.classList.add('dark');
      else root.classList.remove('dark');
    };
    apply();
    if (theme === 'system' && typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => apply();
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, [theme]);

  // 启动时自动检查一次更新（每天最多一次；未配置检查地址则跳过）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!shouldAutoCheck()) return;
        const s = await db.settings.get('updateUrl');
        const url = (s?.value as string) ?? '';
        if (!url || cancelled) return;
        const info = await checkUpdate(url);
        if (info && !cancelled) {
          toast(`发现新版本 v${info.version}，请到「系统设置 → 软件更新」下载`, 'success');
        }
      } catch {
        /* 检查失败静默，下次启动再试 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}

/**
 * 每个页面单独包一层 ErrorBoundary：
 * 某页崩溃时左侧导航仍在，用户可切到别的页面，不会整页白屏卡死。
 * key 用 pathname —— 切路由时重置错误状态，回到崩溃页会重新尝试渲染。
 */
function AppRoutes() {
  const { pathname } = useLocation();
  const wrap = (node: ReactNode) => <ErrorBoundary key={pathname}>{node}</ErrorBoundary>;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={wrap(<OverviewPage />)} />
        <Route path="/entry" element={wrap(<EntryPage />)} />
        <Route path="/cycle" element={wrap(<CyclePage />)} />
        <Route path="/query" element={wrap(<QueryPage />)} />
        <Route path="/extras" element={wrap(<ExtrasPage />)} />
        <Route path="/chart" element={wrap(<ChartPage />)} />
        <Route path="/experiment" element={wrap(<ExperimentPage />)} />
        <Route path="/other" element={wrap(<OtherEntryPage />)} />
        <Route path="/stats" element={wrap(<StatsPage />)} />
        <Route path="/settings" element={wrap(<SettingsPage />)} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}
