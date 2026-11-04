// Tiny safe math for typed sizes: numbers, + - * /, parentheses, unary minus. No eval. Returns NaN if invalid.
export function evalExpr(text) {
  if (/[\d.]\s+[\d.]/.test(String(text))) return NaN; // "2 3" is not 23
  const s = String(text).replace(/\s+/g, "");
  if (!s) return NaN;
  let i = 0;
  const num = () => {
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) throw new Error("number expected");
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const factor = () => {
    if (s[i] === "-") return i++, -factor();
    if (s[i] === "+") return i++, factor();
    if (s[i] === "(") {
      i++;
      const v = expr();
      if (s[i] !== ")") throw new Error("missing )");
      i++;
      return v;
    }
    return num();
  };
  const term = () => {
    let v = factor();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const r = factor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = () => {
    let v = term();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = expr();
    return i === s.length && Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}
