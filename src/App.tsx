import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import EntryPage from './pages/Entry';
import CyclePage from './pages/Cycle';
import QueryPage from './pages/Query';
import ChartPage from './pages/Chart';
import StatsPage from './pages/Stats';
import SettingsPage from './pages/Settings';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/entry" replace />} />
          <Route path="/entry" element={<EntryPage />} />
          <Route path="/cycle" element={<CyclePage />} />
          <Route path="/query" element={<QueryPage />} />
          <Route path="/chart" element={<ChartPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/entry" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
