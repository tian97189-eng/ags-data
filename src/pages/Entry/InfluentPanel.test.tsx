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
