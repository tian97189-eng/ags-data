import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import EntryPage from './index';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('EntryPage 自定义指标', () => {
  beforeEach(clearAll);

  it('自定义直读指标出现在录入页', async () => {
    await db.indicators.add({
      name: '高氯酸盐', category: 'custom', method: 'direct', unit: 'mg/L',
      defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 10,
    });
    await db.reactors.add({
      code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
    });

    render(<EntryPage />);

    const matches = await screen.findAllByText('高氯酸盐', { exact: false });
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('停用的自定义指标不出现', async () => {
    await db.indicators.add({
      name: '停用指标', category: 'custom', method: 'direct', unit: 'mg/L',
      defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: false, sortOrder: 10,
    });
    await db.reactors.add({
      code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
    });

    render(<EntryPage />);

    // 等出水区域渲染完（空状态兜底）后再断言停用指标不存在
    await screen.findByText('没有可录入的指标');
    expect(screen.queryByText('停用指标', { exact: false })).toBeNull();
  });
});
