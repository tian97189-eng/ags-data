import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Chip from '../../components/common/Chip';
import MLSSPage from './MLSSPage';
import ParticleSizePage from './ParticleSizePage';
import EPSPage from './EPSPage';
import SVIPage from './SVIPage';

const TABS = [
  { key: 'mlss', label: '污泥浓度' },
  { key: 'particle', label: '筛分粒径' },
  { key: 'svi', label: '污泥沉降性' },
  { key: 'eps', label: 'EPS（PS/PN）' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function ExtrasPage() {
  const [tab, setTab] = useState<TabKey>('mlss');
  return (
    <div>
      <PageHeader
        title="其他指标"
        desc="自定义计算工作表（污泥浓度、筛分粒径、沉降性、EPS 等）。填入测量重量/体积，自动算出浓度和分布。"
      />
      <div className="flex gap-1 flex-wrap mb-4">
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>
      {tab === 'mlss' && <MLSSPage />}
      {tab === 'particle' && <ParticleSizePage />}
      {tab === 'svi' && <SVIPage />}
      {tab === 'eps' && <EPSPage />}
    </div>
  );
}