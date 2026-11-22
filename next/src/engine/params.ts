// Named parameters (E66, E67): a table of named numbers, each a number or an expression of numbers, other parameters and a few functions; a step's number may be an expression string that starts with `=`.
// Pure: no kernel, no clock. The engine resolves a step's numbers with this before the step runs, so a step only ever sees numbers; a mistake (a name that is not there, a cycle, a division by nothing, a result
// that is not a number) is an error in words that names the parameter, never a silent zero.
//   lengths are in mm, angles in degrees (sin(30) is 0.5)

export class ParamError extends Error { readonly param: string | null; constructor(message: string, param: string | null = null) { super(message); this.param = param; } }
export type Table = Record<string, number | string>;

type Ast = { t: "num"; v: number } | { t: "name"; n: string } | { t: "neg"; a: Ast } | { t: "bin"; op: string; a: Ast; b: Ast } | { t: "call"; f: string; args: Ast[] };

const RAD = Math.PI / 180;
const CONSTANTS: Record<string, number> = { pi: Math.PI, tau: 2 * Math.PI };
const FUNCTIONS: Record<string, { min: number; max: number; run: (a: number[]) => number }> = {
  sin: { min: 1, max: 1, run: (a) => Math.sin(a[0]! * RAD) }, cos: { min: 1, max: 1, run: (a) => Math.cos(a[0]! * RAD) }, tan: { min: 1, max: 1, run: (a) => Math.tan(a[0]! * RAD) },
  asin: { min: 1, max: 1, run: (a) => Math.asin(a[0]!) / RAD }, acos: { min: 1, max: 1, run: (a) => Math.acos(a[0]!) / RAD }, atan: { min: 1, max: 1, run: (a) => Math.atan(a[0]!) / RAD }, atan2: { min: 2, max: 2, run: (a) => Math.atan2(a[0]!, a[1]!) / RAD },
  sqrt: { min: 1, max: 1, run: (a) => Math.sqrt(a[0]!) }, abs: { min: 1, max: 1, run: (a) => Math.abs(a[0]!) }, pow: { min: 2, max: 2, run: (a) => Math.pow(a[0]!, a[1]!) }, hypot: { min: 1, max: 8, run: (a) => Math.hypot(...a) },
  min: { min: 1, max: 16, run: (a) => Math.min(...a) }, max: { min: 1, max: 16, run: (a) => Math.max(...a) }, round: { min: 1, max: 1, run: (a) => Math.round(a[0]!) }, floor: { min: 1, max: 1, run: (a) => Math.floor(a[0]!) }, ceil: { min: 1, max: 1, run: (a) => Math.ceil(a[0]!) },
};
export const isReserved = (name: string) => name in CONSTANTS || name in FUNCTIONS;

// ---------------------------------------------------------------- the parser: a number, a name, a call, + - * / % ^ and brackets; ^ binds tighter than a unary minus on its left (-2^2 is -4)
function parse(src: string): Ast {
  let i = 0;
  const peek = () => { while (i < src.length && /\s/.test(src[i]!)) i++; return src[i] ?? ""; };
  const fail = (what: string): never => { throw new ParamError(`${what} at position ${i + 1} of "${src}"`); };
  const num = (): Ast => { const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i)); if (!m) return fail("a number was expected"); i += m[0].length; return { t: "num", v: Number(m[0]) }; };
  const atom = (): Ast => {
    const c = peek();
    if (c === "(") { i++; const e = sum(); if (peek() !== ")") fail("a closing bracket was expected"); i++; return e; }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!; i += m[0].length;
      if (peek() === "(") {
        i++; const args: Ast[] = []; if (peek() === ")") i++; else { for (;;) { args.push(sum()); const d = peek(); i++; if (d === ")") break; if (d !== ",") { i--; fail("a comma or a closing bracket was expected"); } } }
        return { t: "call", f: m[0], args };
      }
      return { t: "name", n: m[0] };
    }
    if (/[\d.]/.test(c)) return num();
    return c === "" ? fail("the expression ends too soon") : fail(`"${c}" is not expected`);
  };
  const power = (): Ast => { const a = atom(); if (peek() === "^") { i++; return { t: "bin", op: "^", a, b: unary() }; } return a; };
  const unary = (): Ast => { const c = peek(); if (c === "-") { i++; return { t: "neg", a: unary() }; } if (c === "+") { i++; return unary(); } return power(); };
  const product = (): Ast => { let a = unary(); for (;;) { const c = peek(); if (c !== "*" && c !== "/" && c !== "%") return a; i++; a = { t: "bin", op: c, a, b: unary() }; } };
  const sum = (): Ast => { let a = product(); for (;;) { const c = peek(); if (c !== "+" && c !== "-") return a; i++; a = { t: "bin", op: c, a, b: product() }; } };
  const e = sum(); if (peek() !== "") fail(`"${peek()}" is not expected`);
  return e;
}
const names = (a: Ast, out: Set<string> = new Set()): Set<string> => { if (a.t === "name") out.add(a.n); else if (a.t === "neg") names(a.a, out); else if (a.t === "bin") { names(a.a, out); names(a.b, out); } else if (a.t === "call") a.args.forEach((x) => names(x, out)); return out; };
function run(a: Ast, lookup: (name: string) => number): number {
  switch (a.t) {
    case "num": return a.v;
    case "name": return a.n in CONSTANTS ? CONSTANTS[a.n]! : lookup(a.n);
    case "neg": return -run(a.a, lookup);
    case "bin": {
      const x = run(a.a, lookup), y = run(a.b, lookup);
      if (a.op === "+") return x + y; if (a.op === "-") return x - y; if (a.op === "*") return x * y; if (a.op === "^") return Math.pow(x, y);
      if (y === 0) throw new ParamError("a division by nothing");
      return a.op === "/" ? x / y : x % y;
    }
    case "call": {
      const f = FUNCTIONS[a.f]; if (!f) throw new ParamError(`there is no function ${a.f}`);
      if (a.args.length < f.min || a.args.length > f.max) throw new ParamError(`${a.f} takes ${f.min === f.max ? f.min : `${f.min} to ${f.max}`} number${f.max === 1 ? "" : "s"}, not ${a.args.length}`);
      return f.run(a.args.map((x) => run(x, lookup)));
    }
  }
}
const finite = (v: number, what: string): number => { if (!Number.isFinite(v)) throw new ParamError(`${what} is not a number (${Number.isNaN(v) ? "it has no value" : "it is infinite"})`); return v; };

/** the value of an expression, with the names looked up by `lookup` (which throws for a name that is not there) */
export function evaluate(expr: string, lookup: (name: string) => number = (n) => { throw new ParamError(`there is no parameter ${n}`); }): number { return finite(run(parse(expr.startsWith("=") ? expr.slice(1) : expr), lookup), `"${expr}"`); }
/** the parameters an expression uses */
export const namesIn = (expr: string): string[] => [...names(parse(expr.startsWith("=") ? expr.slice(1) : expr))].filter((n) => !(n in CONSTANTS));

/**
 * The value of each name in a table, found when asked for and kept: a number is itself, an expression is worked out from the others. A name that is not in the table, a parameter that
 * (through others) uses itself, and any failure inside an expression all throw a `ParamError` that says which parameter.
 */
export function scopeOf(table: Table): (name: string) => number {
  const memo = new Map<string, number>(), open: string[] = [];
  const get = (name: string): number => {
    const known = memo.get(name); if (known !== undefined) return known;
    if (!(name in table)) throw new ParamError(`there is no parameter ${name}`, name);
    if (isReserved(name)) throw new ParamError(`${name} is a constant or a function, not a name a parameter can have`, name);
    if (open.includes(name)) throw new ParamError(`the parameter ${name} depends on itself (${[...open.slice(open.indexOf(name)), name].join(" → ")})`, name);
    const raw = table[name]!; let v: number;
    if (typeof raw === "number") v = finite(raw, `the parameter ${name}`);
    else { open.push(name); try { v = finite(run(parse(raw.startsWith("=") ? raw.slice(1) : raw), get), `the parameter ${name} ("${raw}")`); } catch (e) { throw e instanceof ParamError ? (e.param ? e : new ParamError(`the parameter ${name} ("${raw}"): ${e.message}`, name)) : e; } finally { open.pop(); } }
    memo.set(name, v); return v;
  };
  return get;
}
/** every parameter's value, or the error of the ones that cannot be worked out (the others are still given) */
export function valuesOf(table: Table): { values: Record<string, number>; errors: Record<string, string> } {
  const get = scopeOf(table), values: Record<string, number> = {}, errors: Record<string, string> = {};
  for (const n of Object.keys(table)) { try { values[n] = get(n); } catch (e) { errors[n] = e instanceof Error ? e.message : String(e); } }
  return { values, errors };
}

/** a step's numbers with the expressions worked out: any string that starts with `=` (anywhere in the tree) becomes its number; everything else is left as it is */
export function resolve<T>(value: T, lookup: (name: string) => number): T {
  if (typeof value === "string") return (value.startsWith("=") ? (() => { try { return evaluate(value, lookup); } catch (e) { throw e instanceof ParamError ? (e.param ? e : new ParamError(`"${value}": ${e.message}`)) : e; } })() : value) as T;
  if (Array.isArray(value)) return value.map((v) => resolve(v, lookup)) as T;
  if (value && typeof value === "object") { const out: Record<string, unknown> = {}; for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolve(v, lookup); return out as T; }
  return value;
}
/** the parameters a step's numbers use (for the screen: which steps does this parameter drive) */
export function usedBy(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") { if (value.startsWith("=")) { try { namesIn(value).forEach((n) => out.add(n)); } catch { /* a syntax error is reported when the step is run */ } } }
  else if (Array.isArray(value)) value.forEach((v) => usedBy(v, out));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((v) => usedBy(v, out));
  return out;
}
