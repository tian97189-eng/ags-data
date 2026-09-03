import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Chip from '../../components/common/Chip';
import AppearanceSettings from './AppearanceSettings';
import ReactorSettings from './ReactorSettings';
import CurveSettings from './CurveSettings';
import IndicatorSettings from './IndicatorSettings';
import BackupSettings from './BackupSettings';
import CloudSyncSettings from './CloudSyncSettings';
import UpdateSettings from './UpdateSettings';
import TrashSettings from './TrashSettings';

const TABS = [
  { key: 'appearance', label: '外观' },
  { key: 'reactor', label: '反应器' },
  { key: 'curve', label: '标准曲线' },
  { key: 'indicator', label: '自定义指标' },
  { key: 'backup', label: '备份与导出' },
  { key: 'trash', label: '回收站' },
  { key: 'cloud', label: '云同步' },
  { key: 'update', label: '软件更新' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('reactor');

  return (
    <div>
      <PageHeader title="系统设置" desc="外观、反应器、标准曲线、指标、回收站、备份与云同步" />
      <div className="flex gap-1 flex-wrap mb-4">
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      {tab === 'appearance' && <AppearanceSettings />}
      {tab === 'reactor' && <ReactorSettings />}
      {tab === 'curve' && <CurveSettings />}
      {tab === 'indicator' && <IndicatorSettings />}
      {tab === 'backup' && <BackupSettings />}
      {tab === 'trash' && <TrashSettings />}
      {tab === 'cloud' && <CloudSyncSettings />}
      {tab === 'update' && <UpdateSettings />}
    </div>
  );
}
