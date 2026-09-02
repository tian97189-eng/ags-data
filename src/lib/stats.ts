/** 去除率 = (进水 − 出水) / 进水 × 100；任一缺失返回 null，严禁按 0 计算 */
export function removalRate(influent: number | null, effluent: number | null): number | null {
  if (influent == null || effluent == null) return null;
  if (influent === 0) return null;
  return ((influent - effluent) / influent) * 100;
}

/** 亚硝积累率 NAR = NO2 / (NO2 + NO3) × 100 */
export function nar(no2: number | null, no3: number | null): number | null {
  if (no2 == null || no3 == null) return null;
  const denom = no2 + no3;
  if (denom === 0) return null;
  return (no2 / denom) * 100;
}

/** 算术平均，空数组返回 null */
export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

/** 样本标准差（n-1），少于 2 个返回 null */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const ss = xs.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - 1));
}

/** 皮尔逊相关系数，长度不等或 <3 返回 null */
export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const n = xs.length;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** 达标率 = 达标数 / 总数 × 100 */
export function attainmentRate(
  values: number[],
  threshold: number | null,
  direction: 'below' | 'above',
): number | null {
  if (threshold == null || values.length === 0) return null;
  const ok = values.filter((v) => (direction === 'below' ? v <= threshold : v >= threshold)).length;
  return (ok / values.length) * 100;
}

/** 最小值（空数组返回 null） */
export function min(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.min(...xs);
}

/** 最大值（空数组返回 null） */
export function max(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.max(...xs);
}

/** 描述性统计：一次返回 count/mean/stdev/min/max */
export function describe(xs: number[]): { count: number; mean: number | null; stdev: number | null; min: number | null; max: number | null } {
  return {
    count: xs.length,
    mean: mean(xs),
    stdev: stdev(xs),
    min: min(xs),
    max: max(xs),
  };
}

/** 是否超出参考范围（refLow/refHigh 只设置的那侧生效）；无范围或 null 值返回 false */
export function outOfRange(
  value: number | null,
  refLow: number | null,
  refHigh: number | null,
): boolean {
  if (value == null) return false;
  if (refLow != null && value < refLow) return true;
  if (refHigh != null && value > refHigh) return true;
  return false;
}

/** 最小二乘线性回归 y = slope*x + intercept；点数 < 2 返回 null */
export function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r2: number; n: number } | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  // R² = 相关系数²（syy=0 时所有 y 相同 → 完美贴合但无解释力，按 1 处理）
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, n };
}
