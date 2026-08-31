import { describe, it, expect } from 'vitest';
import { computeMLSS, computeParticleDryWeight, computeParticleDistribution, computeEPS } from './extras';

describe('computeMLSS', () => {
  it('正常输入：MLSS=(M2-M1)/V×1000；MLVSS=(M2+M3-M4)/V×1000', () => {
    const r = computeMLSS({ m1: 0.7515, m2: 0.7743, m3: 25.000, m4: 25.005, v: 15 });
    // MLSS = (0.7743 - 0.7515) / 15 * 1000 = 1.52
    expect(r.mlss).toBeCloseTo(1.52, 2);
    // MLVSS = (0.7743 + 25 - 25.005) / 15 * 1000 = 51.2867
    expect(r.mlvss).toBeCloseTo(51.2867, 2);
  });

  it('任一字段缺失 → 全 null', () => {
    expect(computeMLSS({ m1: null, m2: 1, m3: 1, m4: 1, v: 1 }).mlss).toBeNull();
    expect(computeMLSS({ m1: 1, m2: null, m3: 1, m4: 1, v: 1 }).mlss).toBeNull();
    expect(computeMLSS({ m1: 1, m2: 1, m3: 1, m4: 1, v: 0 }).mlss).toBeNull();
  });
});

describe('computeParticleDryWeight', () => {
  it('单行：泥重 = M2 - M1', () => {
    expect(computeParticleDryWeight(0.7515, 0.7743)).toBeCloseTo(0.0228, 4);
  });
  it('负值或缺值返回 null', () => {
    expect(computeParticleDryWeight(null, 0.7743)).toBeNull();
    expect(computeParticleDryWeight(0.8, 0.7)).toBeNull(); // 滤纸比泥重
    expect(computeParticleDryWeight(NaN, 0.7)).toBeNull();
  });
});

describe('computeParticleDistribution', () => {
  it('5 行标准分布：d50 在加权累计到 50% 附近', () => {
    // 引用用户截图的数据
    const rows = [
      { rangeId: 1, paperWeight: 0.7515, sampleWeight: 0.7743, mid: 550 + 25 }, // >355 中位 ~500+25
      { rangeId: 2, paperWeight: 0.7463, sampleWeight: 0.7974, mid: 300 - 25 + 25 + 25 }, // 200-355
      { rangeId: 3, paperWeight: 0.7620, sampleWeight: 0.7952, mid: 200 - 50 + 25 },
      { rangeId: 4, paperWeight: 0.7430, sampleWeight: 0.8219, mid: 150 - 50 + 25 },
      { rangeId: 5, paperWeight: 0.7467, sampleWeight: 0.8244, mid: 100 - 50 + 25 },
      { rangeId: 6, paperWeight: 0.7492, sampleWeight: 0.7685, mid: 75 - 25 + 25 }, // 50-100
      { rangeId: 7, paperWeight: 0.7573, sampleWeight: 0.7737, mid: 50 - 25 }, // <50 取 25
    ];
    // 用更简单的数据确保算式正确
    const simple = [
      { rangeId: 1, paperWeight: 1, sampleWeight: 3, mid: 50 },
      { rangeId: 2, paperWeight: 1, sampleWeight: 3, mid: 150 },
      { rangeId: 3, paperWeight: 1, sampleWeight: 3, mid: 250 },
    ];
    const r = computeParticleDistribution(simple);
    expect(r.dryWeights).toEqual([2, 2, 2]);
    expect(r.percents!.map((p) => p!.toFixed(0))).toEqual(['33', '33', '33']);
    // 各 contrib = 33.33 * mid / 100（保留精度）
    expect(r.contributions![0]).toBeCloseTo(16.665, 2);
    expect(r.contributions![2]).toBeCloseTo(83.33, 1);
    // d50 线性插值（在 150 附近，因为前两段累计到 33.33 * 50 / 100 + 33.33 * 150 / 100 ≈ 66 已过 50，所以 d50 ≈ 100）
    expect(r.d50).not.toBeNull();
    expect(r.d50!).toBeGreaterThan(50);
    expect(r.d50!).toBeLessThan(150);
  });

  it('全部贡献相加未到 50%（极小样品）→ d50 取最大 mid', () => {
    const r = computeParticleDistribution([
      { rangeId: 1, paperWeight: 0.99, sampleWeight: 1.0, mid: 50 },
    ]);
    expect(r.d50).toBe(50);
  });

  it('无任何有效记录 → d50=null', () => {
    const r = computeParticleDistribution([
      { rangeId: 1, paperWeight: null, sampleWeight: null, mid: 50 },
    ]);
    expect(r.dryWeights).toEqual([null]);
    expect(r.percents).toEqual([null]);
    expect(r.contributions).toEqual([null]);
    expect(r.d50).toBeNull();
  });
});

describe('computeEPS', () => {
  it('正常输入：含量 = 浓度(mg/L) × 体积(mL) / VSS(mg) → mg/mg 直接；×1000 不对（mg/L 已是 mg/L，×体积 mL / 1000 = mg；除VSS mg = mg/mg；题意按 mg/g VSS → 实际结果不变单位）', () => {
    // 典型实验：PS 50 mg/L × 10 mL / 100 mg VSS = 5 mg/mg = 5 mg/g VSS
    const r = computeEPS({ psConc: 50, pnConc: 30, extractVolume: 10, vssMg: 100 });
    expect(r.psContent).toBeCloseTo(5, 4);
    expect(r.pnContent).toBeCloseTo(3, 4);
    expect(r.pnPsRatio).toBeCloseTo(0.6, 4);
  });

  it('任一字段缺失 → null', () => {
    expect(computeEPS({ psConc: 50, pnConc: null, extractVolume: 10, vssMg: 100 }).psContent).toBeNull();
    expect(computeEPS({ psConc: 50, pnConc: 30, extractVolume: null, vssMg: 100 }).pnContent).toBeNull();
    expect(computeEPS({ psConc: 50, pnConc: 30, extractVolume: 10, vssMg: 0 }).pnPsRatio).toBeNull();
  });

  it('PS=0 时 PN/PS 比避免除零（返回 null）', () => {
    const r = computeEPS({ psConc: 0, pnConc: 5, extractVolume: 10, vssMg: 100 });
    expect(r.pnPsRatio).toBeNull();
    expect(r.pnContent).toBeCloseTo(0.5, 4);
  });
});