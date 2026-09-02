import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function mkCurve(effectiveFrom = '2026-08-20'): CalibrationCurve {
  return {
    id: 7,
    indicatorId: 1,
    effectiveFrom,
    effectiveTo: null,
    k: 0.05,
    b: 0,
    r2: 0.999,
    points: [],
    type: 'fit',
    note: '',
    createdAt: '',
  };
}

function noop() {}

describe('IndicatorCard', () => {
  it('有生效标曲时显示 k 值、生效日与已用天数', () => {
    render(
      <IndicatorCard
        indicator={mkIndicator()}
        reactors={reactors}
        date="2026-09-02"
        defaultBlank=""
        defaultDilution="1"
        cells={{ 1: emptyCell }}
        curve={mkCurve()}
        onDefaultChange={noop}
        onCellChange={noop}
      />,
    );
    expect(screen.getByText(/标曲 k=/)).toBeTruthy();
    expect(screen.getByText(/08-20 生效/)).toBeTruthy();
    expect(screen.getByText(/已用 \d+ 天/)).toBeTruthy();
  });

  it('无标曲时显示"未设标曲"状态的浓度位且不出现标曲行', () => {
    render(
      <IndicatorCard
        indicator={mkIndicator()}
        reactors={reactors}
        date="2026-09-02"
        defaultBlank=""
        defaultDilution="1"
        cells={{ 1: emptyCell }}
        curve={null}
        onDefaultChange={noop}
        onCellChange={noop}
      />,
    );
    expect(screen.queryByText(/标曲 k=/)).toBeNull();
  });

  it('输入吸光度后可看到自动换算的浓度值', () => {
    const cells = { 1: { sample: '0.284', dilution: '1', dilutionOverridden: false } };
    render(
      <IndicatorCard
        indicator={mkIndicator({ refHigh: 8 })}
        reactors={reactors}
        date="2026-09-02"
        defaultBlank="0.012"
        defaultDilution="1"
        cells={cells}
        curve={mkCurve()}
        onDefaultChange={noop}
        onCellChange={noop}
      />,
    );
    // 浓度 = (0.284-0.012-0)/0.05 = 5.44
    expect(screen.getByText('5.44')).toBeTruthy();
  });
});
