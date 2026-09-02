import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExtrasPage from './index';
import { db } from '../../db/schema';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

beforeEach(clearAll);

describe('ExtrasPage - 实验方法 tab', () => {
  it('tab 栏包含「实验方法」且默认展示污泥浓度', () => {
    render(<ExtrasPage />);
    expect(screen.getByText('实验方法')).toBeTruthy();
    // 默认 tab = 污泥浓度
    expect(screen.getAllByText(/粒径范围配置|滤纸/).length).toBeGreaterThan(0);
  });

  it('切到「实验方法」tab 自动预置 11 个骨架并列表展示', async () => {
    render(<ExtrasPage />);
    fireEvent.click(screen.getByText('实验方法'));
    await waitFor(
      () => {
        expect(screen.getByText('氨氮测定')).toBeTruthy();
      },
      { timeout: 2000 },
    );
    expect(screen.getByText('SBR 污泥筛粒径')).toBeTruthy();
    expect(screen.getByText('MLSS / MLVSS 烘干灼烧')).toBeTruthy();
    expect(screen.getByText(/个实验方法/)).toBeTruthy();
  });

  it('点击方法卡片进入详情（步骤/试剂/仪器/注意事项都在）', async () => {
    render(<ExtrasPage />);
    fireEvent.click(screen.getByText('实验方法'));
    const card = await waitFor(() => screen.getByText('氨氮测定'), { timeout: 2000 });
    fireEvent.click(card);
    // 详情页出现
    await waitFor(() => expect(screen.getByText(/操作步骤/)).toBeTruthy());
    expect(screen.getByText('纳氏试剂法 420nm')).toBeTruthy();
    expect(screen.getByText('酒石酸钾钠')).toBeTruthy();
    expect(screen.getByText(/完整列表/)).toBeTruthy();
    expect(screen.getByText(/逐步模式/)).toBeTruthy();
    // 返回列表
    fireEvent.click(screen.getByLabelText('返回'));
    await waitFor(() => expect(screen.getByText('氨氮测定')).toBeTruthy());
  });

  it('逐步模式：切换后一次只看一步 + 本步试剂提示', async () => {
    render(<ExtrasPage />);
    fireEvent.click(screen.getByText('实验方法'));
    const card = await waitFor(() => screen.getByText('总磷测定'), { timeout: 2000 });
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByText(/操作步骤/)).toBeTruthy());
    fireEvent.click(screen.getByText('逐步模式'));
    // 第 1 步内容 + 步骤计数
    expect(screen.getByText(/步骤 1 \/ 6/)).toBeTruthy();
    expect(screen.getByText('下一步')).toBeTruthy();
    fireEvent.click(screen.getByText('下一步'));
    expect(screen.getByText(/步骤 2 \/ 6/)).toBeTruthy();
  });

  it('粒径 tab 提供「查看操作步骤」按钮，点击切到方法 tab 并打开粒径 SOP', async () => {
    render(<ExtrasPage />);
    fireEvent.click(screen.getByText('筛分粒径'));
    const btn = await waitFor(() => screen.getByText(/查看操作步骤/), { timeout: 2000 });
    fireEvent.click(btn);
    await waitFor(
      () => expect(screen.getByText(/SBR 污泥筛粒径/)).toBeTruthy(),
      { timeout: 2000 },
    );
    // 详情页标题
    expect(screen.getByText('200-50μm 四级筛')).toBeTruthy();
  });
});
