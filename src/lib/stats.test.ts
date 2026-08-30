import { describe, it, expect } from 'vitest';
import { removalRate, nar, mean, stdev, pearson, attainmentRate } from './stats';

describe('removalRate', () => {
  it('基本计算', () => {
    expect(removalRate(40, 13.6)).toBeCloseTo(66.0, 1);
  });
  it('进水缺失返回 null，禁止按 0 算', () => {
    expect(removalRate(null, 13.6)).toBeNull();
    expect(removalRate(40, null)).toBeNull();
  });
  it('进水为 0 返回 null', () => {
    expect(removalRate(0, 5)).toBeNull();
  });
  it('完全去除为 100%', () => {
    expect(removalRate(40, 0)).toBe(100);
  });
});

describe('nar', () => {
  it('基本计算', () => {
    // 4.9 / (4.9 + 16.1) = 23.33%
    expect(nar(4.9, 16.1)).toBeCloseTo(23.33, 1);
  });
  it('分母为 0 返回 null', () => {
    expect(nar(0, 0)).toBeNull();
  });
  it('任一缺失返回 null', () => {
    expect(nar(null, 5)).toBeNull();
  });
});

describe('mean / stdev', () => {
  it('均值', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([])).toBeNull();
  });
  it('样本标准差 n-1', () => {
    // [1,2,3,4,5] 的样本标准差 = sqrt(2.5)
    expect(stdev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5), 6);
  });
  it('少于 2 个返回 null', () => {
    expect(stdev([1])).toBeNull();
  });
});

describe('pearson', () => {
  it('完全正相关 r=1', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
  });
  it('完全负相关 r=-1', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
  });
  it('长度不等或少于 3 个返回 null', () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 2, 3], [1, 2])).toBeNull();
  });
});

describe('attainmentRate', () => {
  it('达标率（低于阈值）', () => {
    // 4 个值里 3 个 <= 5
    expect(attainmentRate([3, 4, 5, 8], 5, 'below')).toBe(75);
  });
  it('阈值为 null 或空数组返回 null', () => {
    expect(attainmentRate([1, 2, 3], null, 'below')).toBeNull();
    expect(attainmentRate([], 5, 'below')).toBeNull();
  });
});
