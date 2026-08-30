import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import { dailyScope } from '../../lib/entry';
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

// 预置出水空白（defaults 表），进水应与出水共用同一空白
async function seedBlank(indicatorId: number, blankAbs: number) {
  await db.defaults.add({
    scopeKey: dailyScope('2026-08-05'), indicatorId, blankAbs, dilution: 10,
  });
}

describe('InfluentPanel', () => {
  beforeEach(clearAll);

  it('shared 模式：进水用出水空白换算浓度', async () => {
    const { nh4Id } = await seed();
    await seedBlank(nh4Id, 0.012);
    render(<InfluentPanel date="2026-08-05" />);

    await screen.findByLabelText('氨氮 进水检测样');
    fireEvent.change(screen.getByLabelText('氨氮 进水稀释'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('氨氮 进水检测样'), { target: { value: '0.284' } });

    // (0.284 - 0.012 - 0.1) / 0.3 * 10 = 5.7333 -> 5.73（空白取出水 0.012）
    expect(screen.getByText('5.73')).toBeInTheDocument();
  });

  it('进水空白列为只读，显示出水空白值', async () => {
    const { nh4Id } = await seed();
    await seedBlank(nh4Id, 0.012);
    render(<InfluentPanel date="2026-08-05" />);

    await screen.findByLabelText('氨氮 进水检测样');
    // 空白列是只读文本，不是输入框
    expect(screen.queryByLabelText('氨氮 进水空白')).toBeNull();
    expect(screen.getByText('0.012')).toBeInTheDocument();
  });

  it('COD 直读指标不显示稀释列', async () => {
    await seed();
    render(<InfluentPanel date="2026-08-05" />);

    await screen.findByLabelText('COD 进水检测样');
    expect(screen.queryByLabelText('COD 进水稀释')).toBeNull();

    fireEvent.change(screen.getByLabelText('COD 进水检测样'), { target: { value: '40' } });
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('保存后进水记录写入数据库，空白用出水空白且换算正确', async () => {
    const { nh4Id, curveId } = await seed();
    await seedBlank(nh4Id, 0.012);
    const ref = createRef<InfluentPanelHandle>();
    render(<InfluentPanel ref={ref} date="2026-08-05" />);

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
    await seedBlank(nh4Id, 0.012);
    const ref = createRef<InfluentPanelHandle>();
    render(<InfluentPanel ref={ref} date="2026-08-05" />);

    await screen.findByText('每罐各自');
    fireEvent.click(screen.getByText('每罐各自'));

    await screen.findByLabelText('氨氮 R1 进水检测样');
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
