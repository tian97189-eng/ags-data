import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import EntryPage from './pages/Entry';
import CyclePage from './pages/Cycle';
import QueryPage from './pages/Query';
import ExtrasPage from './pages/Extras';
import ChartPage from './pages/Chart';
import StatsPage from './pages/Stats';
import SettingsPage from './pages/Settings';
import { useAppStore } from './store/useAppStore';
import { db } from './db/schema';
import { checkUpdate, shouldAutoCheck } from './lib/updater';

export default function App() {
  const toast = useAppStore((s) => s.toast);

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
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/entry" replace />} />
          <Route path="/entry" element={<EntryPage />} />
          <Route path="/cycle" element={<CyclePage />} />
          <Route path="/query" element={<QueryPage />} />
          <Route path="/extras" element={<ExtrasPage />} />
          <Route path="/chart" element={<ChartPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/entry" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
