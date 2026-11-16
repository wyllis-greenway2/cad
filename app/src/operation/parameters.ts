// Named parameters and formulas (`dec_named_parameters`): a parameter is a name with a formula (`width`, `2*width + 1`); a step's number can be tied to a formula. Pure: no scene here, only text and numbers.

type Node =
  | { k: "num"; v: number }
  | { k: "name"; n: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { k: "call"; f: string; args: Node[] };

const DEG = Math.PI / 180;
const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: (x) => Math.sin(x * DEG), cos: (x) => Math.cos(x * DEG), tan: (x) => Math.tan(x * DEG), // (degrees, as every angle of the program)
};
const CONSTANTS: Record<string, number> = { pi: Math.PI };
export const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Whether a name can be given to a parameter: a word, not a function and not a constant. */
export const nameOk = (n: string): boolean => NAME.test(n) && !(n in FUNCTIONS) && !(n in CONSTANTS);

/** Parse a formula; a string means it is wrong, and says how. */
export function parseExpr(text: string): Node | string {
  const src = text.trim().replace(/^=/, "");
  if (!src) return "the formula is empty";
  let i = 0;
  const ws = () => { while (src[i] === " ") i++; };
  const fail = (m: string): never => { throw new Error(m); };
  const primary = (): Node => {
    ws();
    const c = src[i];
    if (c === "(") { i++; const e = sum(); ws(); if (src[i] !== ")") fail("a ) is missing"); i++; return e; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { i += num[0].length; return { k: "num", v: Number(num[0]) }; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      i += id[0].length; ws();
      if (src[i] === "(") {
        if (!(id[0] in FUNCTIONS)) fail(`${id[0]} is not a function`);
        i++; const args: Node[] = []; ws();
        if (src[i] !== ")") { for (;;) { args.push(sum()); ws(); if (src[i] === ",") { i++; continue; } break; } }
        if (src[i] !== ")") fail("a ) is missing"); i++;
        return { k: "call", f: id[0], args };
      }
      return { k: "name", n: id[0] };
    }
    return fail(c === undefined ? "the formula stops too soon" : `unexpected "${c}"`);
  };
  const unary = (): Node => { ws(); if (src[i] === "-") { i++; return { k: "neg", a: unary() }; } if (src[i] === "+") { i++; return unary(); } return power(); };
  const power = (): Node => { const a = primary(); ws(); if (src[i] === "^") { i++; return { k: "bin", op: "^", a, b: unary() }; } return a; };
  const product = (): Node => { let a = unary(); for (;;) { ws(); const o = src[i]; if (o !== "*" && o !== "/") return a; i++; a = { k: "bin", op: o, a, b: unary() }; } };
  const sum = (): Node => { let a = product(); for (;;) { ws(); const o = src[i]; if (o !== "+" && o !== "-") return a; i++; a = { k: "bin", op: o, a, b: product() }; } };
  try { const e = sum(); ws(); if (i < src.length) fail(`unexpected "${src[i]}"`); return e; } catch (e) { return (e as Error).message; }
}

/** The names a formula uses (the constants and functions are not names). */
export function usesOf(text: string): string[] {
  const n = parseExpr(text);
  if (typeof n === "string") return [];
  const out = new Set<string>();
  const walk = (x: Node): void => { if (x.k === "name") { if (!(x.n in CONSTANTS)) out.add(x.n); } else if (x.k === "neg") walk(x.a); else if (x.k === "bin") { walk(x.a); walk(x.b); } else if (x.k === "call") x.args.forEach(walk); };
  walk(n);
  return [...out];
}

/** The value of a formula given the values of the parameters; a string is why not. */
export function evaluate(text: string, values: Readonly<Record<string, number>>): number | string {
  const n = parseExpr(text);
  if (typeof n === "string") return n;
  const go = (x: Node): number => {
    switch (x.k) {
      case "num": return x.v;
      case "name": { if (x.n in CONSTANTS) return CONSTANTS[x.n]!; const v = values[x.n]; if (v === undefined) throw new Error(`${x.n} is not a parameter, or has no value`); return v; }
      case "neg": return -go(x.a);
      case "bin": { const a = go(x.a), b = go(x.b); return x.op === "+" ? a + b : x.op === "-" ? a - b : x.op === "*" ? a * b : x.op === "/" ? a / b : Math.pow(a, b); }
      case "call": return FUNCTIONS[x.f]!(...x.args.map(go));
    }
  };
  try { const v = go(n); return Number.isFinite(v) ? v : "the formula has no value (a division by nothing, or too big)"; } catch (e) { return (e as Error).message; }
}

/** The values of all the parameters (name → formula): each is made from the ones it uses; one that cannot be made says why (a name nobody gave, a circle of formulas, a mistake in the formula). */
export function evaluateAll(defs: Readonly<Record<string, string>>): { values: Record<string, number>; errors: Record<string, string> } {
  const values: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const state = new Map<string, 1 | 2>();
  const make = (name: string): void => {
    if (state.get(name) === 2) return;
    if (state.get(name) === 1) { errors[name] = "the formulas go in a circle"; return; }
    state.set(name, 1);
    for (const u of usesOf(defs[name]!)) if (u in defs) make(u);
    if (!errors[name]) {
      const v = evaluate(defs[name]!, values);
      if (typeof v === "string") errors[name] = v; else values[name] = v;
    }
    state.set(name, 2);
  };
  for (const n of Object.keys(defs)) make(n);
  // whatever used a parameter that failed fails too
  for (const n of Object.keys(defs)) if (!(n in values) && !errors[n]) errors[n] = "a parameter it uses has no value";
  return { values, errors };
}
