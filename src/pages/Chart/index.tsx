import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/common/EmptyState';

export default function ChartPage() {
  return (
    <div>
      <PageHeader title="可视化" desc="趋势图、周期曲线与对比分析" />
      <EmptyState title="可视化功能将在 P5 阶段完成" />
    </div>
  );
}
