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

describe('ExtrasPage - 污泥浓度：一个反应器 3 张滤纸平行样取均值（问题：需要三滤纸并取平均）', () => {
  async function seedR1() {
    await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
  }
  /** 等某张滤纸记录出现（fireEvent 后等待 db flush，模拟真实单输入） */
  async function waitRowCount(n: number, timeout = 4000) {
    await waitFor(async () => {
      expect((await db.mlssRecords.toArray()).length).toBe(n);
    }, { timeout });
  }
  /** 输入一个字段并等待其生效 */
  async function type(slot: number, field: string, value: string) {
    const input = screen.getByLabelText(`R1 滤纸${slot} ${field}`) as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    // number 输入渲染时会归一化（0.1000 → 0.1），等 db 落库由调用方 waitRowCount 兜底；
    // 这里只等 React 完成本次渲染
    await new Promise((r) => setTimeout(r, 30));
  }

  it('新增区展示 R1 chip 与 3 张滤纸卡（R1-1/R1-2/R1-3）', async () => {
    await seedR1();
    render(<ExtrasPage />);
    await screen.findByText('R1', undefined, { timeout: 3000 });
    await waitFor(() => {
      expect(screen.getByText('R1-1 滤纸')).toBeTruthy();
      expect(screen.getByText('R1-2 滤纸')).toBeTruthy();
      expect(screen.getByText('R1-3 滤纸')).toBeTruthy();
      expect(screen.getByText(/三滤纸均值/)).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('只填滤纸1 的 M1 → 自动入库（reactorId 对应 R1 + slot=1），其它字段 null', async () => {
    await seedR1();
    render(<ExtrasPage />);
    await screen.findByText('R1-1 滤纸', undefined, { timeout: 3000 });
    await type(1, 'M1 滤纸重 (g)', '0.123');
    await waitRowCount(1);
    const rows = await db.mlssRecords.toArray();
    const r1 = rows.find((x) => x.slot === 1)!;
    expect(r1.paperNo).toBe('R1-1');
    expect(r1.m1).toBe(0.123);
    expect(r1.m2).toBeNull();
    expect(r1.m3).toBeNull();
    expect(r1.m4).toBeNull();
    expect(r1.v).toBeNull();
  });

  it('同一张滤纸分天补全：再填 M2+V → upsert 到同一行，字段累加', async () => {
    await seedR1();
    render(<ExtrasPage />);
    await screen.findByText('R1-1 滤纸', undefined, { timeout: 3000 });
    await type(1, 'M1 滤纸重 (g)', '0.100');
    await waitRowCount(1);
    await type(1, 'M2 滤纸+泥 (g)', '0.350');
    await type(1, 'V 取样体积 (mL)', '25');
    await waitRowCount(1); // 仍是同一行
    await waitFor(async () => {
      const rows = await db.mlssRecords.toArray();
      const r1 = rows.find((x) => x.slot === 1)!;
      expect(r1.m1).toBe(0.100);
      expect(r1.m2).toBe(0.350);
      expect(r1.v).toBe(25);
      expect(r1.mlss).toBeCloseTo(((0.350 - 0.100) / 25) * 1000, 3);
    }, { timeout: 3000 });
  });

  it('3 张滤纸各填齐 M1/M2/V → 均值卡 = 三张 MLSS 平均，且三张明细都显示', async () => {
    await seedR1();
    render(<ExtrasPage />);
    await screen.findByText('R1-1 滤纸', undefined, { timeout: 3000 });
    // M1 不一样 → 三张 MLSS 8 / 6 / 4 → 均值 6
    await type(1, 'M1 滤纸重 (g)', '0.1000');
    await type(2, 'M1 滤纸重 (g)', '0.1500');
    await type(3, 'M1 滤纸重 (g)', '0.2000');
    for (const s of [1, 2, 3]) {
      await type(s, 'M2 滤纸+泥 (g)', '0.3');
      await type(s, 'V 取样体积 (mL)', '25');
    }
    await waitRowCount(3);
    await waitFor(() => {
      // 均值卡 6.0000（明细滤纸2 也是 6.0000 → 用全部匹配）
      expect(screen.getAllByText('6.0000 g/L').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });
    const body = document.body.textContent ?? '';
    expect(body).toContain('8.0000 g/L'); // 滤纸1
    expect(body).toContain('4.0000 g/L'); // 滤纸3
  });

  it('清空某张纸最后一个字段 → 该张纸记录删除（避免留下空行）', async () => {
    await seedR1();
    render(<ExtrasPage />);
    await screen.findByText('R1-1 滤纸', undefined, { timeout: 3000 });
    await type(1, 'M1 滤纸重 (g)', '0.1');
    await waitRowCount(1);
    await type(1, 'M1 滤纸重 (g)', '');
    await waitRowCount(0);
  });
});

describe('ExtrasPage - 污泥浓度历史：旧记录（自由纸编号）仍兼容显示', () => {
  it('旧记录（reactorId null / 无 slot）在历史中显示为「旧」组且不崩溃', async () => {
    await db.mlssRecords.add({
      date: '2026-09-02', reactorId: null, paperNo: 'A-1',
      m1: 0.1, m2: 0.2, m3: 0.3, m4: 0.4, v: 10,
      mlss: 10, mlvss: 5, note: '', createdAt: '',
    });
    render(<ExtrasPage />);
    await screen.findByText(/旧/, undefined, { timeout: 3000 });
    const body = document.body.textContent ?? '';
    expect(body).toContain('A-1');
    // 旧记录单张纸自身 MLSS=10 → 表格 toFixed(4) 显示 10.0000
    expect(body).toContain('10.0000');
    expect((await db.mlssRecords.toArray()).length).toBe(1);
  });
});

describe('ExtrasPage - 粒径筛分手机卡片（问题：6 列被 360px 屏挤压重叠）', () => {
  beforeEach(clearAll);

  it('DOM 同时存在桌面表格（hidden md:block）和手机卡片（md:hidden），不重叠', async () => {
    // 准备 2 个粒径区间 + 1 条当日记录
    await db.particleSizeRanges.bulkAdd([
      { from: 200, to: 355, mid: 277.5, sortOrder: 1 },
      { from: 100, to: 200, mid: 150, sortOrder: 2 },
    ]);
    const r1 = (await db.particleSizeRanges.toArray())[0];
    await db.particleSizeRecords.add({
      date: '2026-09-02', reactorId: null, rangeId: r1.id!,
      paperWeight: 0.123, sampleWeight: 0.456, dryWeight: 0.333, percent: 60, contribution: 166.5,
      note: '', createdAt: '',
    });

    render(<ExtrasPage />);
    // 切到粒径 tab
    fireEvent.click(screen.getByText('筛分粒径'));
    // 等粒径页加载（看输入框 aria-label）
    await waitFor(() => {
      expect(screen.getAllByLabelText(/200-355.*滤纸重/).length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    // 桌面表格容器存在（hidden md:block）
    expect(document.querySelector('div.hidden.md\\:block.overflow-x-auto.max-w-full')).toBeTruthy();
    // 手机卡片容器存在（md:hidden）
    expect(document.querySelector('div.md\\:hidden.space-y-2')).toBeTruthy();
  });

  it('手机卡片：每个粒径区间一张卡，含「区间名 / M1 / M2 / 泥重 / 占比 / 加权」6 字段', async () => {
    await db.particleSizeRanges.bulkAdd([
      { from: 200, to: 355, mid: 277.5, sortOrder: 1 },
      { from: 100, to: 200, mid: 150, sortOrder: 2 },
    ]);
    render(<ExtrasPage />);
    fireEvent.click(screen.getByText('筛分粒径'));
    await waitFor(() => {
      expect(screen.getAllByText('200-355 μm').length).toBeGreaterThan(0);
      expect(screen.getAllByText('100-200 μm').length).toBeGreaterThan(0);
    }, { timeout: 3000 });
    // 只统计手机卡片容器（md:hidden）内的字段（jsdom 不支持 \: 转义选择器，用遍历）
    const mobile = Array.from(document.querySelectorAll('div')).find(
      (el) => el.classList.contains('md:hidden') && el.classList.contains('space-y-2'),
    ) as HTMLElement;
    expect(mobile).toBeTruthy();
    expect(mobile.querySelectorAll('input').length).toBe(4); // 2 区间 × (M1+M2)
    expect(mobile.querySelectorAll('input[aria-label*="滤纸重"]').length).toBe(2);
    expect(mobile.querySelectorAll('input[aria-label*="滤纸+泥"]').length).toBe(2);
    // 计算字段标识（每个区间卡都有：泥重/占比/加权 标题）
    expect(mobile.textContent).toContain('泥重');
    expect(mobile.textContent).toContain('占比');
    expect(mobile.textContent).toContain('加权');
  });
});
