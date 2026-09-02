import { describe, it, expect } from 'vitest';
import { pickQuote, QUOTES } from './index';

describe('pickQuote（每日一言）', () => {
  it('同一天 → 同一条一言', () => {
    const a = pickQuote('2026-09-02');
    const b = pickQuote('2026-09-02');
    expect(a).toBe(b);
  });

  it('不同天 → 通常不同（按日期 hash 取模）', () => {
    // 取一段日期，验证并非全部相同
    const set = new Set<string>();
    for (let d = 1; d <= 31; d++) {
      const day = `2026-09-${String(d).padStart(2, '0')}`;
      set.add(pickQuote(day));
    }
    // 9 月 31 天至少应该出现多条不同（hash 分布）
    expect(set.size).toBeGreaterThan(1);
  });

  it('返回值在 QUOTES 数组内', () => {
    const a = pickQuote('2026-09-02');
    expect(QUOTES).toContain(a);
  });

  it('空字符串 → 仍返回某条（hash=0 → QUOTES[0]）', () => {
    const a = pickQuote('');
    expect(QUOTES).toContain(a);
  });
});
