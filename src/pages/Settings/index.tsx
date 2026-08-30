import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Chip from '../../components/common/Chip';
import ReactorSettings from './ReactorSettings';
import CurveSettings from './CurveSettings';
import IndicatorSettings from './IndicatorSettings';

const TABS = [
  { key: 'reactor', label: '反应器' },
  { key: 'curve', label: '标准曲线' },
  { key: 'indicator', label: '自定义指标' },
  { key: 'backup', label: '备份与导出' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('reactor');

  return (
    <div>
      <PageHeader title="系统设置" desc="反应器、标准曲线、指标与备份" />
      <div className="flex gap-1 flex-wrap mb-4">
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      {tab === 'reactor' && <ReactorSettings />}
      {tab === 'curve' && <CurveSettings />}
      {tab === 'indicator' && <IndicatorSettings />}
      {tab === 'backup' && (
        <div className="text-sm text-slate-500 py-10 text-center">
          备份与导出将在 P7 阶段完成
        </div>
      )}
    </div>
  );
}
