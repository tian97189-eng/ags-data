import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';

export default function CyclePage() {
  return (
    <div>
      <PageHeader title="全周期" desc="周期性密集采样的录入与统计" />
      <EmptyState title="全周期功能将在 P3 阶段完成" />
    </div>
  );
}
