import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echart-mock" />,
}));
import { db } from '../../db/schema';
import CurveSettings from './CurveSettings';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seedIndicator() {
  return db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
}

describe('CurveSettings 删除', () => {
  beforeEach(clearAll);

  it('历史曲线可删除', async () => {
    const indicatorId = await seedIndicator();
    const oldId = await db.curves.add({
      indicatorId, effectiveFrom: '2026-08-01', effectiveTo: '2026-08-10',
      k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
    });

    render(<CurveSettings />);
    await screen.findByText('删除');

    await userEvent.click(screen.getByText('删除'));
    await screen.findByText('删除标准曲线');
    const confirmBtn = screen.getAllByText('删除').pop();
    await userEvent.click(confirmBtn!);

    await waitFor(async () => {
      expect(await db.curves.get(oldId)).toBeUndefined();
    });
  });

  it('删除当前生效的公式曲线', async () => {
    const indicatorId = await seedIndicator();
    const curId = await db.curves.add({
      indicatorId, effectiveFrom: '2026-08-01', effectiveTo: null,
      k: 0, b: 0, r2: 1, points: [], batchNo: '', note: '', createdAt: '',
      formulaType: 'formula', formula: '(6.9627*(A-A0)-0.004)*D',
    });

    render(<CurveSettings />);
    await screen.findByText('删除此曲线');

    await userEvent.click(screen.getByText('删除此曲线'));
    await screen.findByText('删除标准曲线');
    const confirmBtn = screen.getAllByText('删除').pop();
    await userEvent.click(confirmBtn!);

    await waitFor(async () => {
      expect(await db.curves.get(curId)).toBeUndefined();
    });
  });
});

describe('CurveSettings 历史曲线表窄屏可滚动（问题2）', () => {
  beforeEach(clearAll);

  it('历史曲线表：表头含 min-w + 容器 overflow-x-auto', async () => {
    const indicatorId = await seedIndicator();
    // 历史曲线（被前一条"覆盖"，进入 history 列表）
    await db.curves.add({
      indicatorId, effectiveFrom: '2026-08-01', effectiveTo: '2026-08-19',
      k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: 'A1', note: '', createdAt: '',
    });
    // 当前生效曲线
    await db.curves.add({
      indicatorId, effectiveFrom: '2026-08-20', effectiveTo: null,
      k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
    });
    render(<CurveSettings />);
    await screen.findByText('历史曲线');
    // 等历史曲线表加载（useLiveQuery 异步，避免 waitFor 假定时器问题）
    for (let i = 0; i < 50; i++) {
      for (const t of document.querySelectorAll('table')) {
        if (t.className.includes('min-w-') && t.parentElement?.className.includes('overflow-x-auto')) {
          return; // 通过
        }
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('未找到带 min-w + overflow-x-auto 的表格');
  });
});
