import { describe, it, expect } from 'vitest';
import { round, formatNumber, formatPercent, timeToMinutes, minutesToTime } from './format';

describe('format', () => {
  it('round 四舍五入到指定位数', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(2.005, 2)).toBe(2.01);
  });

  it('formatNumber 空值显示"—"，不用 0 兜底', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatNumber(13.6)).toBe('13.6');
  });

  it('formatPercent 空值显示"—"', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(66.0)).toBe('66%');
  });

  it('timeToMinutes / minutesToTime 互逆', () => {
    expect(timeToMinutes('08:30')).toBe(510);
    expect(minutesToTime(510)).toBe('08:30');
    expect(minutesToTime(0)).toBe('00:00');
  });
});
