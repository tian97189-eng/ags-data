import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { db } from '../../db/schema';
import QueryPage from './index';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

/** 断言：找到一个 <table>，其外层 div 带 overflow-x-auto 且 table 本身带 min-w-* 类 */
async function expectTableScrollable() {
  await waitFor(() => {
    const tables = document.querySelectorAll('table');
    expect(tables.length).toBeGreaterThan(0);
    let ok = false;
    for (const t of tables) {
      const wrap = t.parentElement;
      if (!wrap) continue;
      if (wrap.className.includes('overflow-x-auto') && t.className.includes('min-w-')) {
        ok = true;
        break;
      }
    }
    expect(ok).toBe(true);
  });
}

describe('查询整理 表格窄屏可横向滚动（问题2）', () => {
  beforeEach(clearAll);

  it('查询表格：表头列含 min-w + 容器 overflow-x-auto（手机端不挤成竖排）', async () => {
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
    render(<QueryPage />);
    await screen.findByText('导出 Excel');
    // 等数据真的渲染（防止 useLiveQuery 异步）
    await new Promise((r) => setTimeout(r, 100));
    await expectTableScrollable();
  });
});
