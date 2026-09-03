import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomNav from './BottomNav';

function renderNav(initialPath = '/overview') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('BottomNav 固定5项+更多抽屉（问题：10项横滑新用户看不到后面功能）', () => {
  it('底部固定显示：概览/录入/指标/实验/查询/更多（6 个槽位，无横滑区）', () => {
    renderNav('/overview');
    for (const label of ['概览', '录入', '指标', '实验', '查询', '更多']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // 抽屉内项目初始不可见（尚未点更多）
    expect(screen.queryByText('周期')).toBeNull();
    expect(screen.queryByText('设置')).toBeNull();
  });

  it('点「更多」→ 抽屉出现且按用户顺序排列：周期/他人/可视/统计/设置（带功能说明）', () => {
    renderNav('/overview');
    fireEvent.click(screen.getByLabelText('更多'));
    // 按顺序出现
    const labels = ['周期', '他人', '可视', '统计', '设置'];
    labels.forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    // 功能说明文字
    expect(screen.getByText('一次全周期的多点采样表')).toBeTruthy();
    expect(screen.getByText('帮别人测的独立空间')).toBeTruthy();
    expect(screen.getByText('趋势曲线 · 周期叠对比')).toBeTruthy();
    expect(screen.getByText('平均值 · 去除率分析')).toBeTruthy();
    expect(screen.getByText('标曲 · 回收站 · 备份')).toBeTruthy();
    // 固定项仍在
    expect(screen.getByText('概览')).toBeTruthy();
  });

  it('当前页在「更多」分组内（如 /stats）→ 「更多」高亮且抽屉该项标「当前」', () => {
    renderNav('/stats');
    const moreBtn = screen.getByLabelText('更多');
    expect(moreBtn.className).toContain('text-brand-700');
    // 打开抽屉，「统计」行高亮 + 显示「当前」
    fireEvent.click(moreBtn);
    const statLink = screen.getByText('统计').closest('a');
    expect(statLink?.className).toContain('bg-brand-50');
    expect(screen.getByText('当前')).toBeTruthy();
  });

  it('当前页在固定区（如 /entry）→ 点更多打开抽屉不显示「当前」，主区录入高亮', () => {
    renderNav('/entry');
    // 主区「录入」激活
    const entryLink = screen.getByText('录入').closest('a');
    expect(entryLink?.className).toContain('text-brand-700');
    // 打开更多 → 无「当前」标签
    fireEvent.click(screen.getByLabelText('更多'));
    expect(screen.queryByText('当前')).toBeNull();
  });

  it('点击抽屉某项 → 抽屉关闭（返回主界面）', () => {
    renderNav('/overview');
    fireEvent.click(screen.getByLabelText('更多'));
    fireEvent.click(screen.getByText('设置'));
    // 抽屉已关闭：设置文字不再出现（关闭后面板卸载）
    expect(screen.queryByText('设置')).toBeNull();
    expect(screen.queryByText('全部功能')).toBeNull();
  });

  it('点遮罩空白区 → 抽屉关闭', () => {
    renderNav('/overview');
    fireEvent.click(screen.getByLabelText('更多'));
    expect(screen.getByText('全部功能')).toBeTruthy();
    // 遮罩 = 面板的父级 fixed div；面板内 stopPropagation，点遮罩自身区域才触发 close
    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement!;
    fireEvent.click(overlay);
    expect(screen.queryByText('全部功能')).toBeNull();
  });

  it('点「关闭更多」按钮 → 抽屉关闭', () => {
    renderNav('/overview');
    fireEvent.click(screen.getByLabelText('更多'));
    fireEvent.click(screen.getByLabelText('关闭更多'));
    expect(screen.queryByText('全部功能')).toBeNull();
  });

  it('固定项点击也会关闭抽屉', () => {
    renderNav('/overview');
    fireEvent.click(screen.getByLabelText('更多'));
    fireEvent.click(screen.getByText('概览'));
    expect(screen.queryByText('全部功能')).toBeNull();
  });
});
