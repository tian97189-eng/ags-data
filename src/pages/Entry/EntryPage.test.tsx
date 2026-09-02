import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import EntryPage from './index';
import { today, prevDay } from '../../lib/format';

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

describe('EntryPage 复制昨天', () => {
  beforeEach(clearAll);

  it('昨天有出水数据时，点「复制昨天」能带到今天并保存', async () => {
    const indId = await db.indicators.add({
      name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
    });
    const rId = await db.reactors.add({
      code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
    });
    // 昨天（= 今天的前一天）存一条
    const prev = prevDay(today());
    await db.measurements.add({
      scene: 'daily', date: prev, phase: null, reactorId: rId, indicatorId: indId,
      inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
      value: null, curveId: null, blankOverridden: false, dilutionOverridden: false, note: '',
    });

    render(<EntryPage />);
    // 等指标卡出现（氨氮标题可能匹配多处，用 findAll）
    await screen.findAllByText('氨氮', { exact: false });

    fireEvent.click(screen.getByText('复制昨天'));

    // 等昨天的吸光度被填进 R1 吸光度输入框（复制是异步的）
    const input = screen.getByLabelText('R1 吸光度') as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('0.284');
    });

    fireEvent.click(screen.getAllByText('保存')[0]);

    await waitFor(async () => {
      const ms = await db.measurements
        .where('scene')
        .equals('daily')
        .filter((m) => m.date === today())
        .toArray();
      expect(ms.length).toBeGreaterThan(0);
      expect(ms[0].sampleAbs).toBeCloseTo(0.284, 4);
    });
  });
});
