import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import InfluentPanel, { type InfluentPanelHandle } from './InfluentPanel';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seed() {
  const nh4Id = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const codId = await db.indicators.add({
    name: 'COD', category: 'basic', method: 'direct', unit: 'mg/L',
    defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 5,
  });
  const curveId = await db.curves.add({
    indicatorId: nh4Id, effectiveFrom: '2026-08-01', effectiveTo: null,
    k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
  });
  const r1 = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  const r2 = await db.reactors.add({
    code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '',
  });
  return { nh4Id, codId, curveId, r1, r2 };
}

function renderPanel(props: { nh4Id: number; blank: string; ref?: React.Ref<InfluentPanelHandle> }) {
  return render(
    <InfluentPanel
      ref={props.ref}
      date="2026-08-05"
      blankByIndicator={{ [props.nh4Id]: props.blank }}
    />,
  );
}

describe('InfluentPanel', () => {
  beforeEach(clearAll);

  it('shared 模式：进水用出水空白换算浓度', async () => {
    const { nh4Id } = await seed();
    renderPanel({ nh4Id, blank: '0.012' });

    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.change(screen.getByLabelText('氨氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('氨氮 进水检测样'), { target: { value: '0.284' } });

    // (0.284 - 0.012 - 0.1) / 0.3 * 10 = 5.7333 -> 5.73（空白取传入的出水空白 0.012）
    expect(screen.getByText('5.73')).toBeInTheDocument();
  });

  it('改变出水空白时，进水浓度实时更新', async () => {
    const { nh4Id } = await seed();
    const { rerender } = renderPanel({ nh4Id, blank: '0.012' });

    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.change(screen.getByLabelText('氨氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('氨氮 进水检测样'), { target: { value: '0.284' } });
    expect(screen.getByText('5.73')).toBeInTheDocument();

    // 出水空白改成 0.062：浓度 = (0.284 - 0.062 - 0.1)/0.3*10 = 4.0667 -> 4.07
    rerender(
      <InfluentPanel date="2026-08-05" blankByIndicator={{ [nh4Id]: '0.062' }} />,
    );
    expect(screen.getByText('4.07')).toBeInTheDocument();
  });

  it('进水空白列为只读，显示出水空白值', async () => {
    const { nh4Id } = await seed();
    renderPanel({ nh4Id, blank: '0.012' });

    await screen.findByLabelText('氨氮 进水检测样');
    // 空白列是只读文本，不是输入框
    expect(screen.queryByLabelText('氨氮 进水空白')).toBeNull();
    expect(screen.getByText('0.012')).toBeInTheDocument();
  });

  it('COD 直读指标不显示稀释列', async () => {
    const { nh4Id } = await seed();
    renderPanel({ nh4Id, blank: '0.012' });

    await screen.findByLabelText('COD 进水检测样');
    expect(screen.queryByLabelText('COD 进水稀释')).toBeNull();

    fireEvent.change(screen.getByLabelText('COD 进水检测样'), { target: { value: '40' } });
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('保存后进水记录写入数据库，空白用出水空白且换算正确', async () => {
    const { nh4Id, curveId } = await seed();
    const ref = createRef<InfluentPanelHandle>();
    renderPanel({ nh4Id, blank: '0.012', ref });

    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.change(screen.getByLabelText('氨氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('氨氮 进水检测样'), { target: { value: '0.284' } });

    await ref.current!.save();

    await waitFor(async () => {
      const list = await db.influents.where('indicatorId').equals(nh4Id).toArray();
      expect(list).toHaveLength(1);
      expect(list[0].blankAbs).toBe(0.012);
      expect(list[0].value).toBeCloseTo(((0.284 - 0.012 - 0.1) / 0.3) * 10, 6);
      expect(list[0].curveId).toBe(curveId);
      expect(list[0].sampleAbs).toBe(0.284);
    });
  });

  it('切换每罐各自模式后按罐保存', async () => {
    const { nh4Id, r1, r2 } = await seed();
    const ref = createRef<InfluentPanelHandle>();
    renderPanel({ nh4Id, blank: '0.012', ref });

    // 先等 shared 模式渲染完成（确保指标/反应器数据已加载）
    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.click(screen.getByText('每罐各自'));

    // 等 perReactor 模式渲染（给足超时，避免并发下 useLiveQuery 响应慢）
    await waitFor(
      () => {
        expect(screen.getByLabelText('氨氮 R1 进水检测样')).toBeTruthy();
      },
      { timeout: 3000 },
    );

    fireEvent.change(screen.getByLabelText('氨氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('氨氮 R1 进水检测样'), { target: { value: '0.284' } });
    fireEvent.change(screen.getByLabelText('氨氮 R2 进水检测样'), { target: { value: '0.5' } });

    await ref.current!.save();

    await waitFor(async () => {
      const list = await db.influents.where('indicatorId').equals(nh4Id).toArray();
      expect(list).toHaveLength(2);
      const r1row = list.find((i) => i.reactorId === r1);
      const r2row = list.find((i) => i.reactorId === r2);
      expect(r1row?.sampleAbs).toBe(0.284);
      expect(r1row?.blankAbs).toBe(0.012);
      expect(r2row?.sampleAbs).toBe(0.5);
    });
  });
});

// —— 问题2：进水总氮 = 三氮之和 ——

/** 建三氮 + 总氮(composite) 指标，各配一条相同 k/b 的曲线 */
async function seedComposite() {
  const nh4 = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const no3 = await db.indicators.add({
    name: '硝态氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 5, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 2,
  });
  const no2 = await db.indicators.add({
    name: '亚硝态氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 5, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 3,
  });
  const tn = await db.indicators.add({
    name: '总氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 3.5,
    compositeType: 'sumOf', compositeRefs: [nh4, no2, no3],
  });
  for (const id of [nh4, no2, no3]) {
    await db.curves.add({
      indicatorId: id, effectiveFrom: '2026-08-01', effectiveTo: null,
      k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
    });
  }
  const r1 = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  const r2 = await db.reactors.add({
    code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '',
  });
  return { nh4, no2, no3, tn, r1, r2 };
}

const BLANKS = (ids: { nh4: number; no2: number; no3: number }) => ({
  [ids.nh4]: '0.012',
  [ids.no2]: '0.012',
  [ids.no3]: '0.012',
});

describe('InfluentPanel 进水总氮', () => {
  beforeEach(clearAll);

  it('总氮行显示「自动求和」且无输入框', async () => {
    const ids = await seedComposite();
    render(<InfluentPanel date="2026-08-05" blankByIndicator={BLANKS(ids)} />);

    await screen.findByLabelText('氨氮 进水检测样');
    expect(screen.getByText('总氮')).toBeInTheDocument();
    expect(screen.getByText('自动求和')).toBeInTheDocument();
    expect(screen.queryByLabelText('总氮 进水检测样')).toBeNull();
    expect(screen.queryByLabelText('总氮 进水稀释')).toBeNull();
  });

  it('shared 模式：总氮浓度 = 氨氮+硝态+亚硝 实时求和', async () => {
    const ids = await seedComposite();
    render(<InfluentPanel date="2026-08-05" blankByIndicator={BLANKS(ids)} />);

    await screen.findByLabelText('氨氮 进水检测样');
    for (const [label, sample] of [
      ['氨氮 进水稀释', '10'],
      ['硝态氮 进水稀释', '10'],
      ['亚硝态氮 进水稀释', '10'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: sample } });
    }
    for (const [label, sample] of [
      ['氨氮 进水检测样', '0.284'],
      ['硝态氮 进水检测样', '0.5'],
      ['亚硝态氮 进水检测样', '0.2'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: sample } });
    }

    // 三氮各自 = (sample-0.012-0.1)/0.3*10；总和 = (0.984-0.036-0.3)/0.3*10 = 21.6
    expect(screen.getByText('21.6')).toBeInTheDocument();
  });

  it('保存后总氮写一条 value=三氮和的进水记录（不存吸光度）', async () => {
    const ids = await seedComposite();
    const ref = createRef<InfluentPanelHandle>();
    render(<InfluentPanel ref={ref} date="2026-08-05" blankByIndicator={BLANKS(ids)} />);

    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.change(screen.getByLabelText('氨氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('硝态氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('亚硝态氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('氨氮 进水检测样'), { target: { value: '0.284' } });
    fireEvent.change(screen.getByLabelText('硝态氮 进水检测样'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('亚硝态氮 进水检测样'), { target: { value: '0.2' } });

    await ref.current!.save();

    await waitFor(async () => {
      const list = await db.influents.where('indicatorId').equals(ids.tn).toArray();
      expect(list).toHaveLength(1);
      expect(list[0].value).toBeCloseTo(21.6, 6);
      expect(list[0].sampleAbs).toBeNull();
      expect(list[0].inputType).toBe('direct');
    });
  });

  it('perReactor 模式：每罐总氮 = 该罐三氮和；未填的罐不生成总氮记录', async () => {
    const ids = await seedComposite();
    const ref = createRef<InfluentPanelHandle>();
    render(<InfluentPanel ref={ref} date="2026-08-05" blankByIndicator={BLANKS(ids)} />);

    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.click(screen.getByText('每罐各自'));
    await waitFor(() => screen.getByLabelText('氨氮 R1 进水检测样'), { timeout: 3000 });

    fireEvent.change(screen.getByLabelText('氨氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('硝态氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('亚硝态氮 进水稀释'), { target: { value: '10' } });
    // 只填 R1 的三氮
    fireEvent.change(screen.getByLabelText('氨氮 R1 进水检测样'), { target: { value: '0.284' } });
    fireEvent.change(screen.getByLabelText('硝态氮 R1 进水检测样'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('亚硝态氮 R1 进水检测样'), { target: { value: '0.2' } });

    await ref.current!.save();

    await waitFor(async () => {
      const list = await db.influents.where('indicatorId').equals(ids.tn).toArray();
      // 只有 R1 有总氮记录，R2 无（三氮缺失）
      expect(list).toHaveLength(1);
      expect(list[0].reactorId).toBe(ids.r1);
      expect(list[0].value).toBeCloseTo(21.6, 6);
    });
  });
});

describe('InfluentPanel 窄屏布局', () => {
  beforeEach(clearAll);

  it('每罐各自表头只显示罐号（不再挤在一起的"检测样→浓度"长文案）', async () => {
    const { nh4Id } = await seed();
    renderPanel({ nh4Id, blank: '0.012' });
    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.click(screen.getByText('每罐各自'));
    await waitFor(() => screen.getByLabelText('氨氮 R1 进水检测样'), { timeout: 5000 });

    // 通过 title 定位 perReactor 表头列，断言列文本只显示罐号（避免匹配到残留 DOM）
    const thR1 = screen.getByTitle('R1 检测样 → 浓度');
    const thR2 = screen.getByTitle('R2 检测样 → 浓度');
    expect((thR1.textContent ?? '').trim()).toBe('R1');
    expect((thR2.textContent ?? '').trim()).toBe('R2');
  });

  it('每罐各自表头带完整 title 提示', async () => {
    const { nh4Id } = await seed();
    renderPanel({ nh4Id, blank: '0.012' });
    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.click(screen.getByText('每罐各自'));
    await waitFor(() => screen.getByLabelText('氨氮 R1 进水检测样'), { timeout: 3000 });
    // 用 title 属性查找（鼠标悬停才显示的辅助说明）
    expect(screen.getByTitle('R1 检测样 → 浓度')).toBeInTheDocument();
    expect(screen.getByTitle('R2 检测样 → 浓度')).toBeInTheDocument();
  });

  it('表格设置最小宽度保证多罐时窄屏能横向滚动而不重叠', async () => {
    const { nh4Id } = await seed();
    // 加第3个罐模拟多罐
    await db.reactors.add({
      code: 'R3', name: 'R3', note: '', active: true, sortOrder: 3, createdAt: '',
    });
    renderPanel({ nh4Id, blank: '0.012' });
    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.click(screen.getByText('每罐各自'));
    await waitFor(() => screen.getByLabelText('氨氮 R3 进水检测样'), { timeout: 3000 });

    const tables = document.querySelectorAll('table');
    expect(tables.length).toBeGreaterThan(0);
    const table = tables[0];
    // 表格设了 min-w-[640px] 类，避免被压缩重叠
    expect(table.className).toMatch(/min-w-\[640px\]/);
    // 父容器提供横向滚动
    const scrollContainer = table.parentElement!;
    expect(scrollContainer.className).toMatch(/overflow-x-auto/);
  });
});
