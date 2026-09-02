import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../db/schema';
import QueryPage from './index';

const mocks = vi.hoisted(() => ({ saveAndShare: vi.fn() }));

vi.mock('../../lib/share', () => ({ saveAndShare: mocks.saveAndShare }));

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seed() {
  const indId = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const rId = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  await db.measurements.add({
    scene: 'daily', date: '2026-09-02', phase: null, reactorId: rId, indicatorId: indId,
    inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
    value: 5.7, curveId: null, blankOverridden: false, dilutionOverridden: false,
    note: '', createdAt: '',
  });
}

describe('QueryPage 导出（需求1：手机端也能拿到文件）', () => {
  beforeEach(async () => {
    await clearAll();
    await seed();
    mocks.saveAndShare.mockReset();
    mocks.saveAndShare.mockResolvedValue({ ok: true, method: 'web' });
  });

  it('点「导出 Excel」→ saveAndShare 收到 base64 xlsx + 正确文件名/mime', async () => {
    render(<QueryPage />);
    await screen.findByText('导出 Excel');
    // 等 useLiveQuery 加载完成（再点，避免测量数据尚未就绪导致 click 错配）
    await new Promise((r) => setTimeout(r, 100));
    fireEvent.click(screen.getByText('导出 Excel'));

    for (let i = 0; i < 50; i++) {
      if (mocks.saveAndShare.mock.calls.length > 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(mocks.saveAndShare).toHaveBeenCalledTimes(1);
    const [opts] = mocks.saveAndShare.mock.calls[0];
    expect(opts.filename).toBe('AGS数据导出.xlsx');
    expect(opts.encoding).toBe('base64');
    expect(opts.mime).toContain('spreadsheetml');
    // xlsx PK 头的 base64 编码是 UE...
    expect(opts.content).toMatch(/^UE/);
  });

  it('点「宽表 CSV」→ saveAndShare 收到 utf8 文本', async () => {
    render(<QueryPage />);
    await screen.findByText('宽表 CSV');
    fireEvent.click(screen.getByText('宽表 CSV'));

    for (let i = 0; i < 50; i++) {
      if (mocks.saveAndShare.mock.calls.length > 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(mocks.saveAndShare).toHaveBeenCalledTimes(1);
    const [opts] = mocks.saveAndShare.mock.calls[0];
    expect(opts.filename).toBe('AGS宽表.csv');
    expect(opts.encoding).toBeUndefined(); // 默认 utf8
    expect(opts.mime).toBe('text/csv;charset=utf-8');
    // CSV 带 BOM 前缀
    expect(opts.content.startsWith('\uFEFF')).toBe(true);
  });
});
