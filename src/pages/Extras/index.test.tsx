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

describe('ExtrasPage - 污泥浓度分次保存（问题：M1/M2/M3/M4 分 3 天测，一次填完才能保存）', () => {
  beforeEach(clearAll);

  it('只填 M1（其它空）也能点保存：行入库但 M2-M4-V 为 null', async () => {
    render(<ExtrasPage />);
    await screen.findByText('可分次保存', undefined, { timeout: 3000 });
    fireEvent.change(screen.getByLabelText('滤纸编号'), { target: { value: 'A-1' } });
    await waitFor(() => {
      expect((screen.getByLabelText('滤纸编号') as HTMLInputElement).value).toBe('A-1');
    });
    fireEvent.change(screen.getByLabelText('M1 滤纸重 (g)'), { target: { value: '0.123' } });
    await waitFor(() => {
      expect((screen.getByLabelText('M1 滤纸重 (g)') as HTMLInputElement).value).toBe('0.123');
    });
    fireEvent.click(screen.getByText('保存（按日期+编号自动合并）'));
    // 轮询入库
    await waitFor(async () => {
      const rows = (await db.mlssRecords.toArray()).filter((r) => r.paperNo === 'A-1');
      expect(rows).toHaveLength(1);
      expect(rows[0].m1).toBe(0.123);
      expect(rows[0].m2).toBeNull();
      expect(rows[0].m3).toBeNull();
      expect(rows[0].m4).toBeNull();
      // V 默认 15 mL（产品预填，多数实验固定用 15）；用户没改即保留默认值
      expect(rows[0].v).toBe(15);
    }, { timeout: 3000 });
  });

  it('同 (日期+编号) 多次保存：upsert 到同一行，字段累加', async () => {
    render(<ExtrasPage />);
    await screen.findByText('可分次保存', undefined, { timeout: 3000 });
    fireEvent.change(screen.getByLabelText('滤纸编号'), { target: { value: 'B-2' } });
    await waitFor(() => {
      expect((screen.getByLabelText('滤纸编号') as HTMLInputElement).value).toBe('B-2');
    });
    // 第 1 次：只填 M1
    fireEvent.change(screen.getByLabelText('M1 滤纸重 (g)'), { target: { value: '0.100' } });
    await waitFor(() => {
      expect((screen.getByLabelText('M1 滤纸重 (g)') as HTMLInputElement).value).toBe('0.100');
    });
    // 等 React state 同步（再 flush 几轮 microtask）
    await waitFor(() => {
      expect((screen.getByLabelText('M1 滤纸重 (g)') as HTMLInputElement).value).toBe('0.100');
    });
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(screen.getByText('保存（按日期+编号自动合并）'));
    await waitFor(async () => {
      const rows = await db.mlssRecords.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].m1).toBe(0.100);
    }, { timeout: 3000 });
    // 第 2 次：填 M2 + V（再点保存应 upsert 不新增）
    fireEvent.change(screen.getByLabelText('M2 滤纸+泥 (g)'), { target: { value: '0.350' } });
    fireEvent.change(screen.getByLabelText('V 取样体积 (mL)'), { target: { value: '25' } });
    fireEvent.click(screen.getByText('保存（按日期+编号自动合并）'));
    await waitFor(async () => {
      const rows = await db.mlssRecords.toArray();
      expect(rows).toHaveLength(1); // 仍是同一行
      expect(rows[0].m1).toBe(0.100); // 已填字段保留
      expect(rows[0].m2).toBe(0.350);
      expect(rows[0].v).toBe(25);
      expect(rows[0].mlss).toBeCloseTo((0.350 - 0.100) / 25 * 1000, 3);
    }, { timeout: 3000 });
  });

  it('空记录（纸编号但 5 个值都空）→ 不入库且提示', async () => {
    render(<ExtrasPage />);
    await screen.findByText('可分次保存', undefined, { timeout: 3000 });
    fireEvent.change(screen.getByLabelText('滤纸编号'), { target: { value: 'X' } });
    await waitFor(() => {
      expect((screen.getByLabelText('滤纸编号') as HTMLInputElement).value).toBe('X');
    });
    fireEvent.click(screen.getByText('保存（按日期+编号自动合并）'));
    await waitFor(async () => {
      expect(await db.mlssRecords.toArray()).toHaveLength(0);
    }, { timeout: 2000 });
  });

  it('历史卡片：未填满时显示「已填 N/5」状态条 + 「补充」按钮', async () => {
    // 插入一条只填 M1/M2 的记录
    const id = await db.mlssRecords.add({
      date: '2026-09-02', reactorId: null, paperNo: 'P-1',
      m1: 0.1, m2: 0.2, m3: null, m4: null, v: null,
      mlss: null, mlvss: null, note: '', createdAt: '',
    });
    render(<ExtrasPage />);
    // 进入该日期
    const cal = document.querySelector('.history-cal-cal');
    if (cal) {
      const day = cal.querySelector('button') ?? cal;
      (day as HTMLElement).click?.();
    }
    await waitFor(() => {
      expect(screen.getAllByText(/已填 2\/5/)[0]).toBeTruthy();
    }, { timeout: 3000 });
    expect(screen.getAllByText(/待补.*M3.*M4.*V/)[0]).toBeTruthy();
    // 手机卡片和桌面表格都有「补充」按钮，至少存在一个
    expect(screen.getAllByText('补充').length).toBeGreaterThan(0);
    void id;
  });

  it('点击「补充」按钮 → 输入框被填充该行已有值', async () => {
    const id = await db.mlssRecords.add({
      date: '2026-09-02', reactorId: null, paperNo: 'P-2',
      m1: 0.111, m2: null, m3: null, m4: null, v: null,
      mlss: null, mlvss: null, note: '', createdAt: '',
    });
    render(<ExtrasPage />);
    // 默认日 = 2026-09-02 = 今天（测试 env 时区）？强制切到 09-02
    const cal = document.querySelector('.history-cal-cal');
    if (cal) {
      const btn = cal.querySelector('button') ?? cal;
      (btn as HTMLElement).click?.();
    }
    await waitFor(() => expect(screen.getAllByText(/已填 1\/5/)[0]).toBeTruthy(), { timeout: 3000 });
    // 点击第一个「补充」按钮
    fireEvent.click(screen.getAllByText('补充')[0]);
    await waitFor(() => {
      const m1Input = screen.getByLabelText('M1 滤纸重 (g)') as HTMLInputElement;
      expect(m1Input.value).toBe('0.111');
    }, { timeout: 3000 });
    expect((screen.getByLabelText('滤纸编号') as HTMLInputElement).value).toBe('P-2');
    void id;
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
