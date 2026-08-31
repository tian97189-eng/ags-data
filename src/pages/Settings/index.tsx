import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Chip from '../../components/common/Chip';
import ReactorSettings from './ReactorSettings';
import CurveSettings from './CurveSettings';
import IndicatorSettings from './IndicatorSettings';
import BackupSettings from './BackupSettings';
import CloudSyncSettings from './CloudSyncSettings';
import UpdateSettings from './UpdateSettings';

const TABS = [
  { key: 'reactor', label: '反应器' },
  { key: 'curve', label: '标准曲线' },
  { key: 'indicator', label: '自定义指标' },
  { key: 'backup', label: '备份与导出' },
  { key: 'cloud', label: '云同步' },
  { key: 'update', label: '软件更新' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('reactor');

  return (
    <div>
      <PageHeader title="系统设置" desc="反应器、标准曲线、指标、备份与云同步" />
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
      {tab === 'backup' && <BackupSettings />}
      {tab === 'cloud' && <CloudSyncSettings />}
      {tab === 'update' && <UpdateSettings />}

      <div className="mt-6 border border-slate-200 rounded-lg p-4 bg-slate-50">
        <div className="text-sm font-medium mb-2">关于本软件</div>
        <dl className="text-xs text-slate-600 space-y-1">
          <div className="flex"><dt className="w-20 shrink-0 text-slate-500">版本</dt><dd><span className="font-mono text-teal-700">v{__APP_VERSION__}</span></dd></div>
          <div className="flex"><dt className="w-20 shrink-0 text-slate-500">用途</dt><dd>好氧颗粒污泥（AGS）实验室数据记录与分析</dd></div>
          <div className="flex"><dt className="w-20 shrink-0 text-slate-500">作者</dt><dd>人无再少年</dd></div>
          <div className="flex"><dt className="w-20 shrink-0 text-slate-500">联系</dt><dd>QQ：<a className="text-teal-700 hover:underline font-mono" href="tencent://message/?uin=2448820735" rel="noopener">2448820735</a>（点击发起临时会话）</dd></div>
        </dl>
        <p className="text-[11px] text-slate-400 mt-3">本工具所有数据均存储在本地浏览器/手机端，不上传到任何云服务（除非你主动配置云同步）。</p>
      </div>
    </div>
  );
}
