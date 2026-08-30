import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';

export default function EntryPage() {
  return (
    <div>
      <PageHeader title="数据录入" desc="按指标分行、按罐分列，吸光度自动换算为浓度" />
      <EmptyState title="录入功能将在 P2 阶段完成" />
    </div>
  );
}
