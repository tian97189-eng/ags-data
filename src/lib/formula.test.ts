import { describe, it, expect } from 'vitest';
import { evaluateFormula } from './formula';

const vars = { A: 0.284, A0: 0.012, D: 10 };

describe('evaluateFormula', () => {
  it('用户示例公式：(6.9627*(A-A0)-0.004)*D', () => {
    const r = evaluateFormula('(6.9627*(A-A0)-0.004)*D', vars);
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo((6.9627 * (0.284 - 0.012) - 0.004) * 10, 6);
  });

  it('四则运算优先级：乘除先于加减', () => {
    expect(evaluateFormula('2+3*4', vars).value).toBe(14);
    expect(evaluateFormula('(2+3)*4', vars).value).toBe(20);
    expect(evaluateFormula('10-4/2', vars).value).toBe(8);
  });

  it('幂运算', () => {
    expect(evaluateFormula('2^3', vars).value).toBe(8);
    expect(evaluateFormula('A^2', vars).value).toBeCloseTo(0.284 * 0.284, 12);
  });

  it('一元负号', () => {
    expect(evaluateFormula('-A', vars).value).toBeCloseTo(-0.284, 12);
    expect(evaluateFormula('-(A-A0)', vars).value).toBeCloseTo(-(0.284 - 0.012), 12);
    expect(evaluateFormula('2^-1', vars).value).toBeCloseTo(0.5, 12);
  });

  it('自动转换全角 × ÷ （ ）', () => {
    const r = evaluateFormula('（6.9627×（A-A0）-0.004）×D', vars);
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo((6.9627 * (0.284 - 0.012) - 0.004) * 10, 6);
  });

  it('变量大小写不敏感', () => {
    expect(evaluateFormula('a-a0', vars).value).toBeCloseTo(0.284 - 0.012, 12);
  });

  it('未知变量报错', () => {
    const r = evaluateFormula('A+B', vars);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('未知变量');
  });

  it('除数为 0 报错', () => {
    const r = evaluateFormula('1/0', vars);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('除数');
  });

  it('空公式报错', () => {
    expect(evaluateFormula('', vars).ok).toBe(false);
    expect(evaluateFormula('   ', vars).ok).toBe(false);
  });

  it('缺少右括号报错', () => {
    const r = evaluateFormula('(A-A0', vars);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('括号');
  });

  it('多余内容报错', () => {
    const r = evaluateFormula('A A0', vars);
    expect(r.ok).toBe(false);
  });

  it('非法字符报错', () => {
    const r = evaluateFormula('A; D', vars);
    expect(r.ok).toBe(false);
  });

  it('小数与 .5 写法', () => {
    expect(evaluateFormula('0.5*A', vars).value).toBeCloseTo(0.5 * 0.284, 12);
    expect(evaluateFormula('.5*A', vars).value).toBeCloseTo(0.5 * 0.284, 12);
  });
});
