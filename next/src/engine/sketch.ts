// The constrained sketch step (E49, E52 to E54, E56; `dec_constraints_in_engine`). Entities with names, constraints by name, dimensions as constraints with a number, and a body's edges held as read-only
// anchors (by the faces beside them, E52): the solver (E48) makes the sketch, and the step's answer is the solved lines with ids made from their names (E6), for the steps after it. A sketch that cannot be made is
// refused with the constraints that hold it back named (`Refusal`, E55); a sketch with freedom is made and says what is free; an anchor whose edge is gone makes the step orphaned, in words (E10).
import * as K from "./kernel.ts";
import { type EdgeRef, type Id, mint } from "./id.ts";
import { Body } from "./lineage.ts";
import { type Constraint, type System, solve } from "./solver.ts";
import { type Line, type Sketch, Refusal, at, frameOf, kinds, needBody, planeOf, unitV } from "./steps.ts";

type V3 = K.V3;
export interface SketchParams {
  /** where it lies: a named plane (`plane`, `offset`), a `frame`, or a `face` of the body that is the first input */
  plane?: string; offset?: number; frame?: unknown; face?: Id;
  points: { id: string; x: number; y: number; fixed?: boolean }[];
  lines?: { id: string; a: string; b: string; /** not part of the profile */ construction?: boolean }[];
  circles?: { id: string; c: string; r: number; fixedR?: boolean }[];
  constraints?: Constraint[];
  /** a body's edge, read-only: a line (two fixed points) in the sketch, or a point where the edge is seen end-on (E53, E54) */
  anchors?: { id: string; edge: EdgeRef }[];
}

kinds["sketch"] = { outputs: "sketch", run: (inputs, { step }) => {
  const p = step.params as SketchParams, body = inputs[0] instanceof Body ? inputs[0] : null;
  if (!Array.isArray(p.points)) throw new Error("a sketch needs its points");
  // where the sketch lies: local (x, y) to the world and back
  const F = p.face ? (() => { if (!body) throw new Error("a sketch on a face needs the body as its first input"); const rec = body.one(p.face); const f = frameOf(rec, null); return { F: f, normal: unitV(K.facts(rec.h).ne) as V3 }; })() : (() => { const pl = planeOf(p as Record<string, any>); const o = pl.at(0, 0), ux = pl.at(1, 0), uy = pl.at(0, 1); return { F: { O: o, u: [ux[0] - o[0], ux[1] - o[1], ux[2] - o[2]] as V3, v: [uy[0] - o[0], uy[1] - o[1], uy[2] - o[2]] as V3 }, normal: pl.normal }; })();
  const local = (q: V3): [number, number] => { const d: V3 = [q[0] - F.F.O[0], q[1] - F.F.O[1], q[2] - F.F.O[2]]; return [d[0] * F.F.u[0] + d[1] * F.F.u[1] + d[2] * F.F.u[2], d[0] * F.F.v[0] + d[1] * F.F.v[1] + d[2] * F.F.v[2]]; };
  const world = (x: number, y: number): V3 => at(F.F, x, y);
  const names = [...p.points.map((q) => q.id), ...(p.lines ?? []).map((q) => q.id), ...(p.circles ?? []).map((q) => q.id), ...(p.anchors ?? []).map((q) => q.id)];
  const dup = names.find((n, i) => names.indexOf(n) !== i); if (dup) throw new Error(`two parts of this sketch are called ${dup}`);
  // the body's edges, held: found by the faces beside them (a lost edge orphans the step), seen in the plane of the sketch
  const anchorPoints: { id: string; x: number; y: number; fixed: true }[] = [], anchorLines: { id: string; a: string; b: string }[] = [], reference: Line[] = [];
  for (const an of p.anchors ?? []) {
    if (!body) throw new Error(`the anchor ${an.id} needs the body as the first input`);
    const edges = body.findEdges(an.edge); if (edges.length > 1) throw new Error(`the anchor ${an.id} is ${edges.length} edges (a face split): say which`);
    const [e0, e1] = K.edgeEnds(edges[0]!.h), a = local(e0), b = local(e1);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) anchorPoints.push({ id: an.id, x: a[0], y: a[1], fixed: true }); // seen end-on: a point in this plane
    else { anchorPoints.push({ id: `${an.id}.a`, x: a[0], y: a[1], fixed: true }, { id: `${an.id}.b`, x: b[0], y: b[1], fixed: true }); anchorLines.push({ id: an.id, a: `${an.id}.a`, b: `${an.id}.b` }); reference.push({ id: mint(step.id, "anchor", an.id), a: e0, b: e1 }); }
  }
  const system: System = { points: [...p.points.map((q) => ({ id: q.id, x: q.x, y: q.y, fixed: !!q.fixed })), ...anchorPoints], lines: [...(p.lines ?? []).map((l) => ({ id: l.id, a: l.a, b: l.b })), ...anchorLines], circles: (p.circles ?? []).map((c) => ({ id: c.id, c: c.c, r: c.r, fixedR: !!c.fixedR })), constraints: p.constraints ?? [] };
  const r = solve(system);
  if (!r.verdict.ok) {
    const who = r.verdict.conflict.length ? `: ${r.verdict.conflict.join(", ")}` : "";
    throw new Refusal(r.verdict.conflict.length ? `these constraints cannot all hold${who}${r.verdict.reason ? ` (${r.verdict.reason})` : ""}` : r.verdict.reason || "this sketch cannot be made", r.verdict.conflict);
  }
  const sol = r.solution.points, lines: Line[] = [];
  for (const l of p.lines ?? []) {
    const a = sol[l.a]!, b = sol[l.b]!;
    if (l.construction) reference.push({ id: mint(step.id, "ref", l.id), a: world(a[0], a[1]), b: world(b[0], b[1]) });
    else lines.push({ id: mint(step.id, "line", l.id), a: world(a[0], a[1]), b: world(b[0], b[1]) });
  }
  const solveInfo = { kind: r.verdict.kind as "solved" | "under" | "redundant", freedom: r.verdict.freedom, free: r.verdict.free, redundant: r.verdict.redundant };
  const normal = F.normal as V3;
  if (!lines.length && (p.circles ?? []).length === 1) { const c = p.circles![0]!, cc = sol[c.c]!; return { kind: "sketch", lines: [], normal, circle: { id: mint(step.id, "circle", c.id), r: r.solution.circles[c.id]!, c: world(cc[0], cc[1]), normal }, reference, solve: solveInfo } as Sketch; }
  const close = (u: V3, v: V3) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]) < 1e-7;
  const closed = lines.length >= 3 && lines.every((l, i) => close(l.b, lines[(i + 1) % lines.length]!.a));
  return { kind: "sketch", lines, normal, ...(closed || !lines.length ? {} : { open: true }), ...(p.face ? { face: p.face } : {}), reference, solve: solveInfo } as Sketch;
} };

/** a rectangle as a tool makes it: four points, four lines, horizontal and vertical (its own constraints, E56) and, when given, a width and a height; corner A at (x, y) */
export function rectangle(x: number, y: number, w: number, h: number, opts: { size?: boolean; fixCorner?: boolean } = {}): Pick<SketchParams, "points" | "lines" | "constraints"> {
  const cs: Constraint[] = [{ id: "hb", kind: "horizontal", parts: ["bottom"] }, { id: "ht", kind: "horizontal", parts: ["top"] }, { id: "vr", kind: "vertical", parts: ["right"] }, { id: "vl", kind: "vertical", parts: ["left"] }];
  if (opts.size !== false) cs.push({ id: "w", kind: "length", parts: ["bottom"], value: w }, { id: "h", kind: "length", parts: ["right"], value: h });
  if (opts.fixCorner !== false) cs.push({ id: "fix", kind: "fixed", parts: ["A"], at: [x, y] });
  return { points: [{ id: "A", x, y }, { id: "B", x: x + w, y }, { id: "C", x: x + w, y: y + h }, { id: "D", x, y: y + h }], lines: [{ id: "bottom", a: "A", b: "B" }, { id: "right", a: "B", b: "C" }, { id: "top", a: "C", b: "D" }, { id: "left", a: "D", b: "A" }], constraints: cs };
}
