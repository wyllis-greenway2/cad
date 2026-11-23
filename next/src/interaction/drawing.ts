// Drawing on the engine's own definition (`in_1564`): what a click does to a sketch's points, lines, circles and constraints, as pure functions of the definition (`SketchParams`) and a place in the sketch's plane (mm). The screen's controller
// (`sketchcontrol.ts`) turns a pointer into a place and calls these; every edit is solved (`solveDefinition`, no kernel) before it is kept, and one the solver refuses leaves the definition as it was and says which constraints hold it back.
// A figure drawn on an earlier one shares its point (a click on a point is that point) or holds its new point on it (a click on a line or a circle puts a point on it), so what is drawn is joined as it looks.
import type { SketchParams } from "../engine/sketch.ts";
import { solveDefinition, systemOf, segsOf } from "../engine/definition.ts";
import { Refusal } from "../engine/refusal.ts";
import { pointOnSeg, alongSeg, type Pt, type Seg } from "../engine/region.ts";
import { RANGEABLE, type Constraint, type Relation, type System } from "../engine/solver.ts";
import { offersFor } from "./suggest.ts";
import { placed } from "./bubbles.ts";

export type Sol = { points: Record<string, [number, number]>; radii: Record<string, number> };
export const emptySketch = (): SketchParams => ({ points: [], lines: [], circles: [], arcs: [], constraints: [] });
const hyp = Math.hypot;

/** an id not used by any part or constraint of the definition: `P1`, `P2`, ... */
export function nextId(p: SketchParams, prefix: string): string {
  const used = new Set([...p.points, ...(p.lines ?? []), ...(p.circles ?? []), ...(p.arcs ?? []), ...(p.constraints ?? [])].map((x) => x.id));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

// ---------------------------------------------------------------- solving and keeping
/** the definition with every part at the place the solve put it (a point the solve moved is where it ended up) */
export function bake(p: SketchParams, s: Sol): SketchParams {
  return { ...p, points: p.points.map((x) => (s.points[x.id] ? { ...x, x: s.points[x.id]![0], y: s.points[x.id]![1] } : x)), ...(p.circles ? { circles: p.circles.map((c) => (s.radii[c.id] !== undefined ? { ...c, r: s.radii[c.id]! } : c)) } : {}) };
}
export type Kept = { ok: true; params: SketchParams; sol: Sol } | { ok: false; why: string; victims: string[] };
/** keep a changed definition if it solves (and then with its parts at the solved places), else say why not */
export function keep(next: SketchParams): Kept {
  try {
    // the first corner stays (`in_1565`): the oldest point is held while the rest of the sketch gives way to a number or a relation; if the sketch cannot hold with it held (a second place is asked for), it is solved without
    const first = next.points.find((q) => !q.fixed)?.id; let s;
    try { s = first ? solveDefinition(next, { hold: [first] }) : solveDefinition(next); } catch (x) { if (!(x instanceof Refusal) || !first) throw x; s = solveDefinition(next); }
    return { ok: true, params: bake(next, s), sol: s };
  } catch (x) {
    if (x instanceof Refusal) return { ok: false, why: x.message, victims: x.victims };
    return { ok: false, why: (x as Error).message, victims: [] };
  }
}
/** the solver's system with the parts at their solved places and only the person's constraints (an arc's ends are the arc's own business): what the bubbles and the offers read */
export function viewSystem(p: SketchParams, s: Sol): System {
  const S = placed(systemOf(p), { points: s.points, circles: s.radii });
  return { ...S, constraints: p.constraints ?? [] };
}

// ---------------------------------------------------------------- what the pointer is at
export type Hit = { kind: "point"; id: string; at: Pt } | { kind: "curve"; id: string; at: Pt; of: "line" | "circle" | "arc" };
/** the nearest place on a segment to `q`, and how far it is */
function nearest(s: Seg, q: Pt): { at: Pt; d: number } {
  if (s.kind === "line") {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], t = Math.max(0, Math.min(1, ((q[0] - s.a[0]) * dx + (q[1] - s.a[1]) * dy) / (dx * dx + dy * dy || 1))), at: Pt = [s.a[0] + dx * t, s.a[1] + dy * t];
    return { at, d: hyp(q[0] - at[0], q[1] - at[1]) };
  }
  const a = Math.atan2(q[1] - s.c[1], q[0] - s.c[0]), on: Pt = [s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)];
  if (alongSeg(s, on, 1e-6 * s.r + 1e-9) !== null) return { at: on, d: Math.abs(hyp(q[0] - s.c[0], q[1] - s.c[1]) - s.r) };
  const ends = [pointOnSeg(s, 0), pointOnSeg(s, s.sweep)].map((e) => ({ at: e, d: hyp(q[0] - e[0], q[1] - e[1]) }));
  return ends[0]!.d <= ends[1]!.d ? ends[0]! : ends[1]!;
}
/** what is within `tol` mm of `q`: a point first (the nearest), else the nearest drawn line, circle or arc */
export function hitAt(p: SketchParams, s: Sol, q: Pt, tol: number): Hit | null {
  let best: Hit | null = null, bd = tol;
  for (const x of p.points) { const at = s.points[x.id]; if (!at) continue; const d = hyp(q[0] - at[0], q[1] - at[1]); if (d < bd) { bd = d; best = { kind: "point", id: x.id, at }; } }
  if (best) return best;
  for (const seg of segsOf(p, s.points, s.radii)) {
    const n = nearest(seg, q); if (n.d >= bd) continue;
    bd = n.d; best = { kind: "curve", id: seg.name, at: n.at, of: (p.lines ?? []).some((l) => l.id === seg.name) ? "line" : (p.arcs ?? []).some((a) => a.id === seg.name) ? "arc" : "circle" };
  }
  return best;
}

// ---------------------------------------------------------------- what a click puts down
/** a place for a figure's point: a point that is there already, or a new point (held on the line or circle it was put on, if it was) */
export type Ref = { id: string } | { at: Pt; on?: { id: string; of: "line" | "circle" | "arc" } };
/** where a click is, as a place for a point: on a point, on a curve, on a grid crossing within `tol`, or free */
export function refOf(p: SketchParams, s: Sol, q: Pt, tol: number, grid: number): Ref {
  const h = hitAt(p, s, q, tol);
  if (h?.kind === "point") return { id: h.id };
  if (h) return { at: h.at, on: { id: h.id, of: h.of } };
  const g: Pt = [Math.round(q[0] / grid) * grid, Math.round(q[1] / grid) * grid];
  return { at: hyp(q[0] - g[0], q[1] - g[1]) < tol ? g : q };
}
export const posOf = (s: Sol, r: Ref): Pt => ("id" in r ? s.points[r.id]! : r.at);
/** the point of a place: its own id, or a new point (and the constraint that holds it on its curve) */
function pointFor(p: SketchParams, r: Ref): { p: SketchParams; id: string } {
  if ("id" in r) return { p, id: r.id };
  const id = nextId(p, "P"), cs: Constraint[] = [];
  if (r.on) cs.push({ id: nextId({ ...p, constraints: [...(p.constraints ?? [])] }, "c"), kind: r.on.of === "line" ? "pointOnLine" : "pointOnCircle", parts: [id, r.on.id] });
  return { p: { ...p, points: [...p.points, { id, x: r.at[0], y: r.at[1] }], constraints: [...(p.constraints ?? []), ...cs] }, id };
}
const same = (a: Pt, b: Pt) => hyp(a[0] - b[0], a[1] - b[1]) < 1e-9;
/** a line from one place to another (nothing when they are the same place) */
export function addLine(p: SketchParams, s: Sol, a: Ref, b: Ref): SketchParams | null {
  if (same(posOf(s, a), posOf(s, b))) return null;
  const A = pointFor(p, a), B = pointFor(A.p, b);
  if (A.id === B.id) return null;
  return { ...B.p, lines: [...(B.p.lines ?? []), { id: nextId(B.p, "L"), a: A.id, b: B.id }] };
}
/** a rectangle with its sides level and upright, from two opposite corners */
export function addRect(p: SketchParams, s: Sol, a: Ref, c: Ref): SketchParams | null {
  const pa = posOf(s, a), pc = posOf(s, c);
  if (Math.abs(pa[0] - pc[0]) < 1e-9 || Math.abs(pa[1] - pc[1]) < 1e-9) return null;
  const A = pointFor(p, a), C = pointFor(A.p, c);
  let q = C.p; const B = pointFor(q, { at: [pc[0], pa[1]] }); q = B.p; const D = pointFor(q, { at: [pa[0], pc[1]] }); q = D.p;
  const L = (a: string, b: string) => { const id = nextId(q, "L"); q = { ...q, lines: [...(q.lines ?? []), { id, a, b }] }; return id; };
  const bottom = L(A.id, B.id), right = L(B.id, C.id), top = L(C.id, D.id), left = L(D.id, A.id);
  const K = (kind: "horizontal" | "vertical", part: string) => { q = { ...q, constraints: [...(q.constraints ?? []), { id: nextId(q, "c"), kind, parts: [part] }] }; };
  K("horizontal", bottom); K("vertical", right); K("horizontal", top); K("vertical", left);
  return q;
}
/** a circle about a place, through a point */
export function addCircle(p: SketchParams, s: Sol, c: Ref, through: Pt): SketchParams | null {
  const m = posOf(s, c), r = hyp(through[0] - m[0], through[1] - m[1]);
  if (r < 1e-9) return null;
  const C = pointFor(p, c);
  return { ...C.p, circles: [...(C.p.circles ?? []), { id: nextId(C.p, "K"), c: C.id, r }] };
}

// ---------------------------------------------------------------- taking parts away
/** The parts go with what hangs on them: a point takes the lines, circles and arcs that use it; every constraint that names a part that is gone goes; an end point that nothing else uses goes with its line. */
export function removeParts(p: SketchParams, ids: string[]): SketchParams {
  const gone = new Set(ids);
  for (let again = true; again;) {
    again = false;
    const add = (id: string) => { if (!gone.has(id)) { gone.add(id); again = true; } };
    for (const l of p.lines ?? []) if (gone.has(l.a) || gone.has(l.b)) add(l.id);
    for (const a of p.arcs ?? []) if (gone.has(a.c) || gone.has(a.a) || gone.has(a.b)) add(a.id);
    for (const c of p.circles ?? []) if (gone.has(c.c)) add(c.id);
  }
  const lines = (p.lines ?? []).filter((l) => !gone.has(l.id)), arcs = (p.arcs ?? []).filter((a) => !gone.has(a.id)), circles = (p.circles ?? []).filter((c) => !gone.has(c.id));
  const used = new Set([...lines.flatMap((l) => [l.a, l.b]), ...arcs.flatMap((a) => [a.a, a.b, a.c]), ...circles.map((c) => c.c)]);
  const constraints = (p.constraints ?? []).filter((c) => !c.parts.some((x) => gone.has(x)));
  const stillNamed = new Set(constraints.flatMap((c) => c.parts));
  // the end points of what went, when nothing else uses them; a point that was selected on its own goes only when it is in `ids`
  const ends = new Set([...(p.lines ?? []).filter((l) => gone.has(l.id)).flatMap((l) => [l.a, l.b]), ...(p.circles ?? []).filter((c) => gone.has(c.id)).map((c) => c.c)]);
  return { ...p, lines, arcs, circles, constraints, points: p.points.filter((x) => !gone.has(x.id) && !(ends.has(x.id) && !used.has(x.id) && !stillNamed.has(x.id))) };
}

// ---------------------------------------------------------------- constraints
export type Constrained = { ok: true; params: SketchParams; sol: Sol; added: string } | { ok: false; why: string; victims: string[]; already?: string[] };
/** Add the relation of this kind for the selected parts (`dimension`: the number that they measure now, to be typed over): kept if the sketch still solves, else said, with the constraints that hold it back. */
export function constrain(p: SketchParams, s: Sol, selection: string[], kind: Relation | "dimension"): Constrained {
  const { offers } = offersFor(viewSystem(p, s), selection), o = kind === "dimension" ? offers.find((x) => x.dimensional) : offers.find((x) => x.kind === kind);
  if (!o) return { ok: false, why: selection.length ? `${kind === "dimension" ? "there is no number to put on" : kind} does not fit what is selected` : "select something first", victims: [] };
  if (o.state === "already") return { ok: false, why: `${o.label} is already said`, victims: [], already: o.by };
  if (o.state === "refused") return { ok: false, why: `${o.label} cannot hold with ${o.holding.join(", ") || "what is there"}`, victims: o.victims.filter((v) => !v.startsWith("offer.")) };
  const id = nextId(p, "c"), c: Constraint = { id, kind: o.kind, parts: o.parts, ...(o.dimensional && o.measure !== null ? { value: Math.round(o.measure * 1e3) / 1e3 } : {}) };
  const k = keep({ ...p, constraints: [...(p.constraints ?? []), c] });
  return k.ok ? { ...k, added: id } : k;
}
/** a new number for a dimension */
export function retype(p: SketchParams, id: string, value: number): Kept {
  const c = (p.constraints ?? []).find((q) => q.id === id);
  if (!c || !RANGEABLE.has(c.kind)) return { ok: false, why: "that is not a number that can be typed", victims: [] };
  if (!(value > 0) && !(c.kind === "angle" || c.kind === "horizontalDistance" || c.kind === "verticalDistance")) return { ok: false, why: "a size must be more than nothing", victims: [id] };
  const k = keep({ ...p, constraints: (p.constraints ?? []).map((q) => (q.id === id ? { ...q, value, min: undefined, max: undefined } : q)) });
  return k.ok ? k : { ...k, victims: k.victims.length ? k.victims : [id] };
}
export const unconstrain = (p: SketchParams, id: string): Kept => keep({ ...p, constraints: (p.constraints ?? []).filter((c) => c.id !== id) });
