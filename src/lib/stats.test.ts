import { describe, it, expect } from 'vitest';
import { removalRate, nar, mean, stdev, min as statsMin, max as statsMax, pearson, attainmentRate, describe as statsDescribe, outOfRange, linearRegression } from './stats';

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

describe('min / max / describe', () => {
  it('min/max 返回最小/最大值；空数组返回 null', () => {
    expect(statsMin([3, 1, 4, 1, 5, 9, 2, 6])).toBe(1);
    expect(statsMax([3, 1, 4, 1, 5, 9, 2, 6])).toBe(9);
    expect(statsMin([])).toBeNull();
    expect(statsMax([])).toBeNull();
  });
  it('describe 一次返回 count/mean/stdev/min/max', () => {
    const d = statsDescribe([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(d.count).toBe(8);
    expect(d.mean).toBeCloseTo(5, 4);
    expect(d.stdev).toBeCloseTo(2.138, 3);
    expect(d.min).toBe(2);
    expect(d.max).toBe(9);
  });
});

describe('outOfRange（异常值标红判断）', () => {
  it('超出上限（> refHigh）为异常', () => {
    expect(outOfRange(9, 0, 8)).toBe(true);
    expect(outOfRange(8, 0, 8)).toBe(false); // 等于上限不算
  });
  it('低于下限（< refLow）为异常', () => {
    expect(outOfRange(-1, 0, null)).toBe(true);
    expect(outOfRange(0.5, 0, null)).toBe(false);
  });
  it('只设一侧范围时，另一侧不判断', () => {
    expect(outOfRange(-1, null, 8)).toBe(false); // 没设下限
    expect(outOfRange(9, null, 8)).toBe(true);
    expect(outOfRange(9, 0, null)).toBe(false); // 没设上限
    expect(outOfRange(0, 0, null)).toBe(false);
  });
  it('null 值或完全没有范围 → 不标红', () => {
    expect(outOfRange(null, 0, 8)).toBe(false);
    expect(outOfRange(5, null, null)).toBe(false);
  });
});

describe('linearRegression（浓度梯度-去除率趋势线）', () => {
  it('完美直线 y=2x+1 → slope=2, intercept=1, R²=1', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => 2 * x + 1);
    const r = linearRegression(xs, ys)!;
    expect(r.slope).toBeCloseTo(2, 6);
    expect(r.intercept).toBeCloseTo(1, 6);
    expect(r.r2).toBeCloseTo(1, 6);
    expect(r.n).toBe(5);
  });
  it('数据点少于 2 个返回 null', () => {
    expect(linearRegression([1], [2])).toBeNull();
  });
  it('x 全部相同（sxx=0）返回 null', () => {
    expect(linearRegression([2, 2, 2], [1, 2, 3])).toBeNull();
  });
  it('有噪声数据时 R² 在 0~1 之间且趋势合理', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const ys = [3.1, 5.9, 8.8, 11.2, 14.1, 17.0];
    const r = linearRegression(xs, ys)!;
    expect(r.slope).toBeCloseTo(2.79, 1);
    expect(r.r2).toBeGreaterThan(0.99);
    expect(r.r2).toBeLessThanOrEqual(1);
  });
});
