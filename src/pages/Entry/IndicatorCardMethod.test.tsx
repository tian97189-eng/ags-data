import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IndicatorCard from './IndicatorCard';
import type { Indicator, Reactor, CalibrationCurve } from '../../db/schema';

function mkIndicator(partial: Partial<Indicator> = {}): Indicator {
  return {
    name: '氨氮',
    category: 'basic',
    method: 'absorbance',
    unit: 'mg/L',
    defaultDilution: 1,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 1,
    ...partial,
  };
}

const reactors: Reactor[] = [{ id: 1, code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' }];
const emptyCell = { sample: '', dilution: '1', dilutionOverridden: false };
const curve: CalibrationCurve = {
  id: 1, indicatorId: 1, effectiveFrom: '2026-08-20', effectiveTo: null,
  k: 0.05, b: 0, r2: 0.999, points: [], type: 'fit', note: '', createdAt: '',
};
const noop = () => {};

function renderCard(ind: Indicator = mkIndicator()) {
  return render(
    <IndicatorCard
      indicator={ind}
      reactors={reactors}
      date="2026-09-02"
      defaultBlank=""
      defaultDilution="1"
      cells={{ 1: emptyCell }}
      curve={curve}
      onDefaultChange={noop}
      onCellChange={noop}
    />,
  );
}

describe('IndicatorCard「方法」入口（需求4）', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('指标卡标题旁显示「方法」按钮', () => {
    renderCard();
    expect(screen.getByText('方法')).toBeTruthy();
  });

  it('点「方法」→ 记录待打开的方法名并跳转 #/extras', () => {
    renderCard(mkIndicator({ name: '亚硝态氮' }));
    fireEvent.click(screen.getByText('方法'));
    expect(window.location.hash).toContain('#/extras');
  });
});
