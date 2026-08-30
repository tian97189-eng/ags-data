import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import CyclePage from './index';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('CyclePage 自定义指标', () => {
  beforeEach(clearAll);

  it('自定义直读指标出现在全周期指标切换中', async () => {
    await db.indicators.add({
      name: '高氯酸盐', category: 'custom', method: 'direct', unit: 'mg/L',
      defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 10,
    });
    const reactorId = await db.reactors.add({
      code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
    });
    await db.cycles.add({
      date: '2026-08-05', name: '周期A', startTime: '08:00', intervalMinutes: 30,
      count: 2, reactorIds: [reactorId], note: '',
    });

    render(<CyclePage />);

    await screen.findByText('高氯酸盐');
  });
});
