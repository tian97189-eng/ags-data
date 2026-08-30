import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';

export default function QueryPage() {
  return (
    <div>
      <PageHeader title="查询整理" desc="筛选、排序、搜索与导出" />
      <EmptyState title="查询功能将在 P4 阶段完成" />
    </div>
  );
}
