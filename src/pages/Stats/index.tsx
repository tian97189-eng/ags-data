import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';

export default function StatsPage() {
  return (
    <div>
      <PageHeader title="统计分析" desc="去除率、亚硝积累率与相关性" />
      <EmptyState title="统计功能将在 P6 阶段完成" />
    </div>
  );
}
