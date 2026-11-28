// A sketch's definition read without the kernel (E48, E49, E62): the solver's system made from points, lines, circles, arcs and constraints, solved, and the drawn parts as the plane's segments. A sketch that lies on a plane has no body in it, so this is all
// the screen needs to draw it, edit it and trim it on its own (`bubbledemo.ts`, `sketchcontrol.ts`); a sketch that holds a body's edges (anchors) is made by `sketch.ts`, which adds them to the same system.
import { Refusal } from "./refusal.ts";
import type { Seg } from "./region.ts";
import type { SketchParams } from "./sketch.ts";
import { type Constraint, type Result, type Options as SolveOptions, type System, solve } from "./solver.ts";

/** the kinds that were once kept and are now another (`q_relation_set`): what each becomes is in `modernise` */
const LEGACY = new Set([
  "collinear",
  "concentric",
  "pointOnLine",
  "pointOnCircle",
  "tangentCircles",
  "equalLength",
  "equalRadius",
]);
/**
 * Kinds of relation that were once kept are the same as others and are no longer made (`q_relation_set`, `in_1642`): **in line** (two lines) is the two ends of the second on the first (two `pointOnLine`) and **concentric** (two circles) is the two centres together (`coincident`). A definition that still has them (a saved file) is read as what they are, once, here: the first keeps its name (the second is `<name>.2`), the other keeps its name.
 */
export function modernise(p: SketchParams): SketchParams {
  const old = (c: { kind: string }) => LEGACY.has(c.kind);
  if (!(p.constraints ?? []).some(old)) return p;
  const centre = (id: string): string | null =>
    (p.circles ?? []).find((x) => x.id === id)?.c ??
    (p.arcs ?? []).find((x) => x.id === id)?.c ??
    ((p.anchors ?? []).some((x) => x.id === id) ? `${id}.c` : null);
  const end = (id: string): [string, string] | null => {
    const l = (p.lines ?? []).find((x) => x.id === id);
    return l ? [l.a, l.b] : (p.anchors ?? []).some((x) => x.id === id) ? [`${id}.a`, `${id}.b`] : null;
  };
  const constraints = (p.constraints ?? []).flatMap((c): Constraint[] => {
    if (c.kind === ("concentric" as string)) {
      const a = centre(c.parts[0]!),
        b = centre(c.parts[1]!);
      return a && b ? [{ ...c, kind: "coincident", parts: [a, b] }] : [c];
    }
    if (c.kind === ("collinear" as string)) {
      const e = end(c.parts[1]!);
      return e
        ? [
            { id: c.id, kind: "on", parts: [e[0], c.parts[0]!] },
            { id: `${c.id}.2`, kind: "on", parts: [e[1], c.parts[0]!] },
          ]
        : [c];
    }
    if (c.kind === ("pointOnLine" as string) || c.kind === ("pointOnCircle" as string)) return [{ ...c, kind: "on" }];
    if (c.kind === ("tangentCircles" as string)) return [{ ...c, kind: "tangent" }];
    // equal length and equal radius are not kinds (`in_1645`): the two sizes are each given as the same number: the size one of them already has as a number if it has one (the first's, if both do and they differ), else the first's as drawn; a part that already has a size is not given a second one (two sizes on one part would only fight)
    if (c.kind === ("equalRadius" as string) || c.kind === ("equalLength" as string)) {
      const radius = c.kind === ("equalRadius" as string),
        kind = radius ? "radius" : "length",
        sized = (id: string) =>
          (p.constraints ?? []).find((q) => q.kind === kind && q.parts[0] === id && q.value !== undefined),
        size = (id: string): number | null => {
          const pt = (q: string) => (p.points ?? []).find((x) => x.id === q);
          if (radius) {
            const k = (p.circles ?? []).find((x) => x.id === id);
            if (k) return k.r;
            const a = (p.arcs ?? []).find((x) => x.id === id),
              c0 = a && pt(a.c),
              s0 = a && pt(a.a);
            return c0 && s0 ? Math.hypot(s0.x - c0.x, s0.y - c0.y) : null;
          }
          const l = (p.lines ?? []).find((x) => x.id === id),
            a = l && pt(l.a),
            b = l && pt(l.b);
          return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : null;
        },
        [first, second] = [c.parts[0]!, c.parts[1]!],
        v = sized(first)?.value ?? sized(second)?.value ?? size(first);
      if (v === null || v === undefined || !(v > 0) || size(second) === null) return [c];
      return [first, second].flatMap((id, i): Constraint[] =>
        sized(id) ? [] : [{ id: i ? `${c.id}.2` : c.id, kind, parts: [id], value: v }],
      );
    }
    return [c];
  });
  return { ...p, constraints };
}
/** the solver's system of a definition: an arc is a circle with its two ends held on it */
export function systemOf(def: SketchParams): System {
  const p = modernise(def);
  const at0 = new Map(p.points.map((q) => [q.id, q] as const));
  const arcCircles = (p.arcs ?? []).map((a) => {
    const c = at0.get(a.c),
      s0 = at0.get(a.a);
    if (!c || !s0) throw new Error(`the arc ${a.id} names a point that is not there`);
    return {
      id: a.id,
      c: a.c,
      r: Math.hypot(s0.x - c.x, s0.y - c.y),
      fixedR: false,
      arc: true,
      ends: [a.a, a.b] as [string, string],
    };
  });
  const arcEnds: Constraint[] = (p.arcs ?? []).flatMap((a) => [
    { id: `${a.id}.start`, kind: "on" as const, parts: [a.a, a.id] },
    { id: `${a.id}.end`, kind: "on" as const, parts: [a.b, a.id] },
  ]);
  return {
    points: p.points.map((q) => ({ id: q.id, x: q.x, y: q.y, fixed: !!q.fixed })),
    lines: (p.lines ?? []).map((l) => ({ id: l.id, a: l.a, b: l.b })),
    circles: [...(p.circles ?? []).map((c) => ({ id: c.id, c: c.c, r: c.r, fixedR: !!c.fixedR })), ...arcCircles],
    constraints: [...(p.constraints ?? []), ...arcEnds],
  };
}
/** a solve that is not ok is refused, in words, with the constraints that hold it back named (E55) */
export function refusalOf(r: Result): Refusal {
  const who = r.verdict.conflict.length ? `: ${r.verdict.conflict.join(", ")}` : "";
  return new Refusal(
    r.verdict.conflict.length
      ? `these constraints cannot all hold${who}${r.verdict.reason ? ` (${r.verdict.reason})` : ""}`
      : r.verdict.reason || "this sketch cannot be made",
    r.verdict.conflict,
  );
}
/**
 * The solve a sketch is made with: the first corner stays (`in_1565`). The oldest point that is not fixed is held while the rest gives way to a number or a relation (a length of 55 on a side that was 40 moves the far end, not the first corner); if the sketch cannot hold
 * with it held (a place is asked of it twice) it is solved without. A drag that names its own pins or held parts is left as it is.
 */
export function solveKeeping(system: System, opts: SolveOptions = {}): Result {
  const first = system.points.find((q) => !q.fixed)?.id;
  if (!first || opts.pins || opts.hold?.length) return solve(system, opts);
  const held = solve(system, { ...opts, hold: [first] });
  return held.verdict.ok ? held : solve(system, opts);
}
/** the places the parts of a definition end up (local to the plane): every point, and the radius of every circle and arc; refused as a sketch is */
export function solveDefinition(
  p: SketchParams,
  opts: SolveOptions = {},
): { points: Record<string, [number, number]>; radii: Record<string, number>; result: Result } {
  if (!Array.isArray(p.points)) throw new Error("a sketch needs its points");
  const names = [
    ...p.points.map((q) => q.id),
    ...(p.lines ?? []).map((q) => q.id),
    ...(p.circles ?? []).map((q) => q.id),
    ...(p.arcs ?? []).map((q) => q.id),
  ];
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`two parts of this sketch are called ${dup}`);
  const result = solveKeeping(systemOf(p), opts);
  if (!result.verdict.ok) throw refusalOf(result);
  return { points: result.solution.points, radii: result.solution.circles, result };
}
/** the drawn lines, arcs and circles of a definition as the plane's segments, from where the solve put them (construction geometry is not drawn) */
export function segsOf(p: SketchParams, sol: Record<string, [number, number]>, radii: Record<string, number>): Seg[] {
  const TAU = 2 * Math.PI,
    norm = (x: number) => {
      const m = x % TAU;
      return m < 0 ? m + TAU : m;
    },
    out: Seg[] = [];
  for (const l of p.lines ?? [])
    if (!l.construction) out.push({ name: l.id, kind: "line", a: sol[l.a]!, b: sol[l.b]! });
  for (const a of p.arcs ?? []) {
    if (a.construction) continue;
    const c = sol[a.c]!,
      s0 = sol[a.a]!,
      e0 = sol[a.b]!,
      ta = Math.atan2(s0[1] - c[1], s0[0] - c[0]),
      tb = Math.atan2(e0[1] - c[1], e0[0] - c[0]);
    out.push({
      name: a.id,
      kind: "arc",
      c,
      r: radii[a.id]!,
      t0: a.cw ? tb : ta,
      sweep: a.cw ? norm(ta - tb) : norm(tb - ta),
    });
  }
  for (const c of p.circles ?? [])
    if (!c.construction) out.push({ name: c.id, kind: "arc", c: sol[c.c]!, r: radii[c.id]!, t0: 0, sweep: TAU });
  return out;
}
