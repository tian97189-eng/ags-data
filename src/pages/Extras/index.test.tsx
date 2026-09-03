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

describe('ExtrasPage - 污泥浓度页 手机窄屏卡片化（问题：数据跑到外面）', () => {
  it('DOM 同时包含桌面表格（hidden md:block）和手机卡片（md:hidden），全部字段都在卡片里', async () => {
    await db.mlssRecords.add({
      date: '2026-09-02', reactorId: null, paperNo: 'A-1',
      m1: 0.1000, m2: 0.1150, m3: 15.0000, m4: 14.9990, v: 15,
      mlss: 1.0000, mlvss: 66.6667, note: '', createdAt: '',
    });
    render(<ExtrasPage />);
    // 等历史日历默认选中最新日期后渲染表格/卡片
    await screen.findByText('滤纸 A-1', undefined, { timeout: 3000 });

    // 桌面表格：含 min-w-[560px] 与 w-20 等固定宽列
    const tables = document.querySelectorAll('table');
    expect(tables.length).toBe(1);
    expect(tables[0].className).toContain('min-w-[560px]');
    // hidden md:block 在 table 外层 div 上（jsdom 不渲染 @media，但 className 都在 DOM 上）
    const desktopWrap = tables[0].parentElement!;
    expect(desktopWrap.className).toContain('hidden');
    expect(desktopWrap.className).toContain('md:block');

    // 手机卡片：每条记录一张，含全部 7 个字段（M1/M2/M3/M4/V/MLSS/MLVSS）+ 滤纸
    const cardContainer = document.querySelector('div.md\\:hidden.space-y-2');
    expect(cardContainer).toBeTruthy();
    // 滤纸标签
    expect(cardContainer!.textContent).toContain('滤纸 A-1');
    // 7 个字段标签
    for (const label of ['M1', 'M2', 'M3', 'M4', 'V (mL)', 'MLSS', 'MLVSS']) {
      expect(cardContainer!.textContent).toContain(label);
    }
    // 关键数值 MLVSS 66.6667 不被截断（包含在卡片文本里）
    expect(cardContainer!.textContent).toContain('66.6667');
  });

  it('卡片模式下的删除按钮能删记录', async () => {
    const id = await db.mlssRecords.add({
      date: '2026-09-02', reactorId: null, paperNo: 'B-2',
      m1: 0.1, m2: 0.2, m3: 0.3, m4: 0.4, v: 10,
      mlss: 10.0, mlvss: 5.0, note: '', createdAt: '',
    });
    render(<ExtrasPage />);
    const cardContainer = (await screen.findByText('滤纸 B-2', undefined, { timeout: 3000 })).closest('div.md\\:hidden.space-y-2') as HTMLElement;
    fireEvent.click(cardContainer.querySelector('button.text-red-600')!);
    // 删除走回收站（多步 await），轮询等最终删除完成
    await waitFor(async () => {
      expect(await db.mlssRecords.get(id)).toBeUndefined();
    }, { timeout: 3000 });
  });
});
