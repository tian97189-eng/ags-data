import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import IndicatorCard, { type CellState } from './IndicatorCard';
import type { CalibrationCurve, Indicator, Reactor } from '../../db/schema';

const curve: CalibrationCurve = {
  id: 1, indicatorId: 1, effectiveFrom: '2026-08-01', effectiveTo: null,
  k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
};

const indicator: Indicator = {
  id: 1, name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
  defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
};

const cod: Indicator = {
  ...indicator, id: 5, name: 'COD', method: 'direct', defaultDilution: 1,
};

const reactors: Reactor[] = [
  { id: 1, code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' },
  { id: 2, code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '' },
];

function renderCard(props: Partial<Parameters<typeof IndicatorCard>[0]> = {}) {
  const cells: Record<number, CellState> = props.cells ?? {
    1: { sample: '', dilution: '10', dilutionOverridden: false },
    2: { sample: '', dilution: '10', dilutionOverridden: false },
  };
  render(
    <IndicatorCard
      indicator={props.indicator ?? indicator}
      reactors={reactors}
      defaultBlank={props.defaultBlank ?? '0.012'}
      defaultDilution={props.defaultDilution ?? '10'}
      cells={cells}
      curve={props.curve === undefined ? curve : props.curve}
      onDefaultChange={props.onDefaultChange ?? (() => {})}
      onCellChange={props.onCellChange ?? (() => {})}
    />,
  );
}

describe('IndicatorCard', () => {
  it('吸光度输入实时换算浓度', () => {
    renderCard({
      cells: {
        1: { sample: '0.284', dilution: '10', dilutionOverridden: false },
        2: { sample: '', dilution: '10', dilutionOverridden: false },
      },
    });
    // (0.284 - 0.012 - 0.1)/0.3 * 10 = 5.7333 -> 5.73
    expect(screen.getByText('5.73')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('无标曲时显示"—"', () => {
    renderCard({
      curve: null,
      cells: {
        1: { sample: '0.284', dilution: '10', dilutionOverridden: false },
        2: { sample: '', dilution: '10', dilutionOverridden: false },
      },
    });
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('direct 指标直接显示浓度，且无稀释列', () => {
    renderCard({
      indicator: cod,
      curve: null,
      cells: {
        1: { sample: '32', dilution: '1', dilutionOverridden: false },
        2: { sample: '', dilution: '1', dilutionOverridden: false },
      },
    });
    expect(screen.getByText('32')).toBeInTheDocument();
    expect(screen.queryByLabelText('R1 稀释')).toBeNull();
  });

  it('改稀释倍数时 onCellChange 收到 overridden=true', async () => {
    const onCellChange = vi.fn();
    renderCard({
      onCellChange,
      cells: {
        1: { sample: '', dilution: '10', dilutionOverridden: false },
        2: { sample: '', dilution: '10', dilutionOverridden: false },
      },
    });
    const dil = screen.getByLabelText('R1 稀释');
    fireEvent.change(dil, { target: { value: '20' } });
    expect(onCellChange).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ dilution: '20', dilutionOverridden: true }),
    );
  });

  it('负值显示红色标记文案', () => {
    renderCard({
      cells: {
        1: { sample: '0.05', dilution: '1', dilutionOverridden: false },
        2: { sample: '', dilution: '1', dilutionOverridden: false },
      },
    });
    // (0.05 - 0.012 - 0.1)/0.3 = -0.2067 -> 负值，仍显示数值（红色）
    expect(screen.getByText('-0.21')).toBeInTheDocument();
  });
});
