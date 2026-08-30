// —— 安全的数学表达式求值器（不使用 eval / new Function）——
// 用于"手动公式"标准曲线。
// 支持的变量：
//   A  = 检测样吸光度
//   A0 = 空白样吸光度
//   D  = 稀释倍数
// 支持的运算：+ - * / ^ 以及括号；自动把全角 × ÷ （ ） 转成半角。

export interface FormulaVars {
  A: number;
  A0: number;
  D: number;
}

export interface FormulaResult {
  ok: boolean;
  value?: number;
  error?: string;
}

const VAR_MAP: Record<string, keyof FormulaVars> = {
  A: 'A',
  A0: 'A0',
  D: 'D',
};

type Token =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'lp' }
  | { type: 'rp' };

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentChar(ch: string): boolean {
  return isLetter(ch) || isDigit(ch);
}

function tokenize(expr: string): { tokens: Token[]; error?: string } {
  const s = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '');

  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (isDigit(ch) || ch === '.') {
      let j = i;
      while (j < s.length && (isDigit(s[j]) || s[j] === '.')) j++;
      const numStr = s.slice(i, j);
      const value = Number(numStr);
      if (!Number.isFinite(value)) {
        return { tokens, error: `无法解析数字：${numStr}` };
      }
      tokens.push({ type: 'num', value });
      i = j;
    } else if (isLetter(ch)) {
      let j = i;
      while (j < s.length && isIdentChar(s[j])) j++;
      const name = s.slice(i, j).toUpperCase();
      if (!(name in VAR_MAP)) {
        return { tokens, error: `未知变量：${name}（可用变量：A、A0、D）` };
      }
      tokens.push({ type: 'var', name });
      i = j;
    } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ type: 'op', value: ch });
      i++;
    } else if (ch === '(') {
      tokens.push({ type: 'lp' });
      i++;
    } else if (ch === ')') {
      tokens.push({ type: 'rp' });
      i++;
    } else {
      return { tokens, error: `无法识别的字符：${ch}` };
    }
  }
  return { tokens };
}

interface ParseOutcome {
  value?: number;
  error?: string;
}

function parse(tokens: Token[], vars: FormulaVars): ParseOutcome {
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];

  function parseExpr(): ParseOutcome {
    let left = parseTerm();
    if (left.error) return left;
    while (peek() && peek()!.type === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = next()!.value;
      const right = parseTerm();
      if (right.error) return right;
      left = { value: op === '+' ? left.value! + right.value! : left.value! - right.value! };
    }
    return left;
  }

  function parseTerm(): ParseOutcome {
    let left = parseUnary();
    if (left.error) return left;
    while (peek() && peek()!.type === 'op' && (peek()!.value === '*' || peek()!.value === '/')) {
      const op = next()!.value;
      const right = parseUnary();
      if (right.error) return right;
      if (op === '/' && right.value === 0) {
        return { error: '除数为 0' };
      }
      left = { value: op === '*' ? left.value! * right.value! : left.value! / right.value! };
    }
    return left;
  }

  function parseUnary(): ParseOutcome {
    if (peek() && peek()!.type === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = next()!.value;
      const operand = parseUnary();
      if (operand.error) return operand;
      return { value: op === '-' ? -operand.value! : operand.value! };
    }
    return parsePower();
  }

  function parsePower(): ParseOutcome {
    const base = parsePrimary();
    if (base.error) return base;
    if (peek() && peek()!.type === 'op' && peek()!.value === '^') {
      next();
      const exp = parseUnary(); // 右结合，允许负指数
      if (exp.error) return exp;
      return { value: Math.pow(base.value!, exp.value!) };
    }
    return base;
  }

  function parsePrimary(): ParseOutcome {
    const t = next();
    if (!t) return { error: '表达式不完整' };
    if (t.type === 'num') return { value: t.value };
    if (t.type === 'var') return { value: vars[VAR_MAP[t.name]] };
    if (t.type === 'lp') {
      const inner = parseExpr();
      if (inner.error) return inner;
      const close = next();
      if (!close || close.type !== 'rp') return { error: '缺少右括号' };
      return { value: inner.value };
    }
    return { error: '意外的符号' };
  }

  const result = parseExpr();
  if (result.error) return result;
  if (pos < tokens.length) return { error: '表达式存在多余内容' };
  return result;
}

export function evaluateFormula(expr: string, vars: FormulaVars): FormulaResult {
  if (!expr || !expr.trim()) {
    return { ok: false, error: '公式为空' };
  }
  const { tokens, error } = tokenize(expr);
  if (error) return { ok: false, error };
  const result = parse(tokens, vars);
  if (result.error) return { ok: false, error: result.error };
  if (result.value == null || !Number.isFinite(result.value)) {
    return { ok: false, error: '计算结果不是有效数值' };
  }
  return { ok: true, value: result.value };
}
