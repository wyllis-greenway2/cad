// The constrained sketch step (E49, E52 to E54, E56; `dec_constraints_in_engine`). Entities with names, constraints by name, dimensions as constraints with a number, and a body's edges held as read-only
// anchors (by the faces beside them, E52): the solver (E48) makes the sketch, and the step's answer is the solved lines with ids made from their names (E6), for the steps after it. A sketch that cannot be made is
// refused with the constraints that hold it back named (`Refusal`, E55); a sketch with freedom is made and says what is free; an anchor whose edge is gone makes the step orphaned, in words (E10).
import * as K from "./kernel.ts";
import { type EdgeRef, type Id, mint } from "./id.ts";
import { Body } from "./lineage.ts";
import { type Constraint, type System, solve } from "./solver.ts";
import { type Loop as RLoop, type Seg, regions } from "./region.ts";
import { type Line, type Sketch, Refusal, at, frameOf, kinds, needBody, planeOf, unitV } from "./steps.ts";

type V3 = K.V3;
export interface SketchParams {
  /** where it lies: a named plane (`plane`, `offset`), a `frame`, or a `face` of the body that is the first input */
  plane?: string; offset?: number; frame?: unknown; face?: Id;
  points: { id: string; x: number; y: number; fixed?: boolean }[];
  lines?: { id: string; a: string; b: string; /** not part of the profile */ construction?: boolean }[];
  circles?: { id: string; c: string; r: number; fixedR?: boolean; construction?: boolean }[];
  /** an arc: a circle (its centre `c`, its radius from the start) with a start `a` and an end `b` on it, counter-clockwise from the start unless `cw` (E62) */
  arcs?: { id: string; c: string; a: string; b: string; cw?: boolean; construction?: boolean }[];
  /** the regions that make the profile: a point inside each; none means the even-odd rule (E63) */
  pick?: [number, number][];
  constraints?: Constraint[];
  /** a body's edge, read-only: a line (two fixed points) in the sketch, or a point where the edge is seen end-on (E53, E54) */
  anchors?: { id: string; edge: EdgeRef }[];
}

/** where a sketch lies: the plane's frame, local (x, y) to the world and back (the interaction layer needs the same) */
export function sketchFrame(p: SketchParams, body: Body | null): { F: { O: V3; u: V3; v: V3 }; normal: V3; local(q: V3): [number, number]; world(x: number, y: number): V3 } {
  const F = p.face ? (() => { if (!body) throw new Error("a sketch on a face needs the body as its first input"); const rec = body.one(p.face); const f = frameOf(rec, null); return { F: f, normal: unitV(K.facts(rec.h).ne) as V3 }; })() : (() => { const pl = planeOf(p as Record<string, any>); const o = pl.at(0, 0), ux = pl.at(1, 0), uy = pl.at(0, 1); return { F: { O: o, u: [ux[0] - o[0], ux[1] - o[1], ux[2] - o[2]] as V3, v: [uy[0] - o[0], uy[1] - o[1], uy[2] - o[2]] as V3 }, normal: pl.normal }; })();
  const local = (q: V3): [number, number] => { const d: V3 = [q[0] - F.F.O[0], q[1] - F.F.O[1], q[2] - F.F.O[2]]; return [d[0] * F.F.u[0] + d[1] * F.F.u[1] + d[2] * F.F.u[2], d[0] * F.F.v[0] + d[1] * F.F.v[1] + d[2] * F.F.v[2]]; };
  return { F: F.F, normal: F.normal as V3, local, world: (x, y) => at(F.F, x, y) };
}
/** make the sketch of a definition: the solve, the lines with ids from their names, the anchors; `step` is the id of the step that makes it */
export function makeSketch(p: SketchParams, body: Body | null, step: { id: string }): Sketch {
  if (!Array.isArray(p.points)) throw new Error("a sketch needs its points");
  const fr = sketchFrame(p, body), F = { F: fr.F, normal: fr.normal }, local = fr.local, world = fr.world;
  const names = [...p.points.map((q) => q.id), ...(p.lines ?? []).map((q) => q.id), ...(p.circles ?? []).map((q) => q.id), ...(p.arcs ?? []).map((q) => q.id), ...(p.anchors ?? []).map((q) => q.id)];
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
  const at0 = new Map(p.points.map((q) => [q.id, q] as const));
  const arcCircles = (p.arcs ?? []).map((a) => { const c = at0.get(a.c), s0 = at0.get(a.a); if (!c || !s0) throw new Error(`the arc ${a.id} names a point that is not there`); return { id: a.id, c: a.c, r: Math.hypot(s0.x - c.x, s0.y - c.y), fixedR: false }; });
  const arcEnds: Constraint[] = (p.arcs ?? []).flatMap((a) => [{ id: `${a.id}.start`, kind: "pointOnCircle" as const, parts: [a.a, a.id] }, { id: `${a.id}.end`, kind: "pointOnCircle" as const, parts: [a.b, a.id] }]);
  const system: System = { points: [...p.points.map((q) => ({ id: q.id, x: q.x, y: q.y, fixed: !!q.fixed })), ...anchorPoints], lines: [...(p.lines ?? []).map((l) => ({ id: l.id, a: l.a, b: l.b })), ...anchorLines], circles: [...(p.circles ?? []).map((c) => ({ id: c.id, c: c.c, r: c.r, fixedR: !!c.fixedR })), ...arcCircles], constraints: [...(p.constraints ?? []), ...arcEnds] };
  const r = solve(system);
  if (!r.verdict.ok) {
    const who = r.verdict.conflict.length ? `: ${r.verdict.conflict.join(", ")}` : "";
    throw new Refusal(r.verdict.conflict.length ? `these constraints cannot all hold${who}${r.verdict.reason ? ` (${r.verdict.reason})` : ""}` : r.verdict.reason || "this sketch cannot be made", r.verdict.conflict);
  }
  const sol = r.solution.points, normal = F.normal as V3, drawn: Line[] = [], segs: Seg[] = [];
  for (const l of p.lines ?? []) {
    const a = sol[l.a]!, b = sol[l.b]!;
    if (l.construction) reference.push({ id: mint(step.id, "ref", l.id), a: world(a[0], a[1]), b: world(b[0], b[1]) });
    else { drawn.push({ id: mint(step.id, "line", l.id), a: world(a[0], a[1]), b: world(b[0], b[1]) }); segs.push({ name: l.id, kind: "line", a, b }); }
  }
  const TAU = 2 * Math.PI, norm = (x: number) => { const m = x % TAU; return m < 0 ? m + TAU : m; };
  for (const a of p.arcs ?? []) {
    if (a.construction) continue;
    const c = sol[a.c]!, s0 = sol[a.a]!, e0 = sol[a.b]!, R = r.solution.circles[a.id]!, ta = Math.atan2(s0[1] - c[1], s0[0] - c[0]), tb = Math.atan2(e0[1] - c[1], e0[0] - c[0]);
    if (Math.hypot(s0[0] - e0[0], s0[1] - e0[1]) < 1e-9 * Math.max(1, R)) throw new Refusal(`the arc ${a.id} starts and ends at the same place`, [a.id]);
    const sweep = a.cw ? norm(ta - tb) : norm(tb - ta), t0 = a.cw ? tb : ta, midT = a.cw ? ta - sweep / 2 : ta + sweep / 2;
    segs.push({ name: a.id, kind: "arc", c, r: R, t0, sweep });
    drawn.push({ id: mint(step.id, "line", a.id), a: world(s0[0], s0[1]), b: world(e0[0], e0[1]), mid: world(c[0] + R * Math.cos(midT), c[1] + R * Math.sin(midT)) });
  }
  for (const c of p.circles ?? []) { if (c.construction) continue; const q = sol[c.c]!; segs.push({ name: c.id, kind: "arc", c: q, r: r.solution.circles[c.id]!, t0: 0, sweep: TAU }); }
  // the ends an arc keeps on its circle are the step's own, not the person's: they are not reported as redundant
  const own = new Set(arcEnds.map((c) => c.id)), redundant = r.verdict.redundant.filter((c) => !own.has(c)), kind = r.verdict.kind === "redundant" && !redundant.length ? (r.verdict.freedom > 0 ? "under" : "solved") : r.verdict.kind;
  const solveInfo = { kind: kind as "solved" | "under" | "redundant", freedom: r.verdict.freedom, free: r.verdict.free, redundant };
  const close = (u: V3, v: V3) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]) < 1e-7;
  const chained = drawn.length >= 2 && drawn.every((l, i) => close(l.b, drawn[(i + 1) % drawn.length]!.a)) && (drawn.length >= 3 || drawn.some((l) => l.mid));
  const loopSketch = (loop: RLoop, hole: boolean): Sketch => {
    if (loop.whole) { const w = loop.whole, c = world(w.c[0], w.c[1]); return { kind: "sketch", lines: [], normal, circle: { id: mint(step.id, "circle", w.name), r: w.r, c, normal } }; }
    const ps = hole ? [...loop.pieces].reverse().map((q) => ({ ...q, a: q.b, b: q.a })) : loop.pieces; // a hole runs the way the kernel wants it: counter-clockwise, as given (E64)
    return { kind: "sketch", normal, lines: ps.map((q) => ({ id: q.of > 1 ? mint(step.id, "line", q.name, q.k) : mint(step.id, "line", q.name), a: world(q.a[0], q.a[1]), b: world(q.b[0], q.b[1]), ...(q.mid ? { mid: world(q.mid[0], q.mid[1]) } : {}) })) } as Sketch;
  };
  const found = regions(segs, p.pick?.length ? { pick: p.pick } : {});
  const info = { reference, solve: solveInfo, definition: p, ...(p.face ? { face: p.face } : {}) };
  const seen = found.faces.map((f) => ({ at: world(f.sample[0], f.sample[1]), area: f.area, filled: f.filled }));
  // a drawing that is one chain, closed, and no part crossing another: the sides in the order drawn, as before
  if (chained && found.profiles.length === 1 && !found.profiles[0]!.holes.length && found.profiles[0]!.outer.pieces.length === drawn.length && !(p.circles ?? []).some((c) => !c.construction)) return { kind: "sketch", lines: drawn, normal, regions: seen, ...info } as Sketch;
  if (found.profiles.length > 1) throw new Refusal(`this drawing makes ${found.profiles.length} separate shapes; pick the regions of one (a point inside each), or draw them in separate sketches`, []);
  if (found.profiles.length === 1) { const pr = found.profiles[0]!, o = loopSketch(pr.outer, false), inner = pr.holes.map((h) => loopSketch(h, true)); return { ...o, ...(inner.length ? { inner } : {}), regions: seen, ...info } as Sketch; }
  return { kind: "sketch", lines: drawn, normal, ...(drawn.length ? { open: true } : {}), regions: seen, ...info } as Sketch; // nothing closed: a path, or nothing yet
}
kinds["sketch"] = { outputs: "sketch", run: (inputs, { step }) => makeSketch(step.params as SketchParams, inputs[0] instanceof Body ? inputs[0] : null, step) };

/** a rectangle as a tool makes it: four points, four lines, horizontal and vertical (its own constraints, E56) and, when given, a width and a height; corner A at (x, y) */
export function rectangle(x: number, y: number, w: number, h: number, opts: { size?: boolean; fixCorner?: boolean } = {}): Pick<SketchParams, "points" | "lines" | "constraints"> {
  const cs: Constraint[] = [{ id: "hb", kind: "horizontal", parts: ["bottom"] }, { id: "ht", kind: "horizontal", parts: ["top"] }, { id: "vr", kind: "vertical", parts: ["right"] }, { id: "vl", kind: "vertical", parts: ["left"] }];
  if (opts.size !== false) cs.push({ id: "w", kind: "length", parts: ["bottom"], value: w }, { id: "h", kind: "length", parts: ["right"], value: h });
  if (opts.fixCorner !== false) cs.push({ id: "fix", kind: "fixed", parts: ["A"], at: [x, y] });
  return { points: [{ id: "A", x, y }, { id: "B", x: x + w, y }, { id: "C", x: x + w, y: y + h }, { id: "D", x, y: y + h }], lines: [{ id: "bottom", a: "A", b: "B" }, { id: "right", a: "B", b: "C" }, { id: "top", a: "C", b: "D" }, { id: "left", a: "D", b: "A" }], constraints: cs };
}

// ---------------------------------------------------------------- copies (E59): which constraints a copy keeps
/** a rigid motion of the sketch's plane, as a tool makes it: mirrored first (in the line through the origin at `mirror` degrees), then turned `deg` degrees, then moved by `by` */
export interface Motion { deg?: number; mirror?: number; by?: [number, number] }
const matrix = (m: Motion): [[number, number], [number, number]] => {
  const t = ((m.deg ?? 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), R: [[number, number], [number, number]] = [[c, -s], [s, c]];
  if (m.mirror === undefined) return R;
  const a = (2 * m.mirror * Math.PI) / 180, F: [[number, number], [number, number]] = [[Math.cos(a), Math.sin(a)], [Math.sin(a), -Math.cos(a)]]; // reflection in the line at `mirror` degrees
  return [[R[0][0] * F[0][0] + R[0][1] * F[1][0], R[0][0] * F[0][1] + R[0][1] * F[1][1]], [R[1][0] * F[0][0] + R[1][1] * F[1][0], R[1][0] * F[0][1] + R[1][1] * F[1][1]]];
};
const clean = (v: number) => { const r = Math.round(v); return Math.abs(v - r) < 1e-9 ? r : v; };
/**
 * What a copy keeps of a sketch's constraints. A relation is kept as it is if it means the same after the motion (a length, a parallel, a tangent: all of those); a relation tied to the world's axes
 * (level, upright, a distance along an axis, an angle's sign, a place) is changed to what it has become (level and upright swap when the sketch is turned a quarter; a distance along an axis changes sign or axis)
 * or, where it cannot be said in the world's axes any more (a sketch turned 30 degrees is not level), **dropped and said**, with the relations among the dropped ones kept as they were (the sides that were all
 * level stay parallel to each other, and square to the upright ones). Nothing is kept as it was when it no longer means the same.
 */
export function carryConstraints(constraints: Constraint[], lineOfPoints: (a: string, b: string) => string | null, m: Motion): { kept: Constraint[]; dropped: { id: string; kind: string; why: string }[]; changed: { id: string; from: string; to: string }[] } {
  const M = matrix(m), kept: Constraint[] = [], dropped: { id: string; kind: string; why: string }[] = [], changed: { id: string; from: string; to: string }[] = [];
  const mirrored = M[0][0] * M[1][1] - M[0][1] * M[1][0] < 0, ex = [clean(M[0][0]), clean(M[1][0])], ey = [clean(M[0][1]), clean(M[1][1])]; // where the axes go: M applied to (1,0) and (0,1)
  const axis = (v: number[]): "h" | "v" | null => (Math.abs(v[1]!) < 1e-9 ? "h" : Math.abs(v[0]!) < 1e-9 ? "v" : null);
  const xAxis = axis(ex), turned = xAxis === null; // the x axis goes to a world axis only for a quarter turn or a mirror in an axis
  const levels: string[] = [], uprights: string[] = [];
  const lineFor = (c: Constraint): string | null => (c.parts.length === 1 ? c.parts[0]! : lineOfPoints(c.parts[0]!, c.parts[1]!));
  for (const c of constraints) {
    if (c.kind === "horizontal" || c.kind === "vertical") {
      const was = c.kind === "horizontal" ? "h" : "v", now = was === "h" ? axis(ex) : axis(ey);  // the direction it had becomes: the image of the x axis, or of the y axis
      if (now === null) { dropped.push({ id: c.id, kind: c.kind, why: `a sketch turned ${((m.deg ?? 0) % 360).toFixed(1)} degrees is not ${c.kind === "horizontal" ? "level" : "upright"}` }); const l = lineFor(c); if (l) (was === "h" ? levels : uprights).push(l); continue; }
      const kind = now === "h" ? "horizontal" : "vertical"; kept.push({ ...c, kind }); if (kind !== c.kind) changed.push({ id: c.id, from: c.kind, to: kind });
    } else if (c.kind === "horizontalDistance" || c.kind === "verticalDistance") {
      // the number along an axis: it follows the axis it went to, with the sign of the way that axis points
      const fromX = c.kind === "horizontalDistance", img = fromX ? ex : ey, to = axis(img);
      if (to === null) { dropped.push({ id: c.id, kind: c.kind, why: `a distance along an axis cannot be kept when the sketch is turned ${((m.deg ?? 0) % 360).toFixed(1)} degrees` }); continue; }
      const sign = (to === "h" ? img[0]! : img[1]!) < 0 ? -1 : 1, kind = to === "h" ? "horizontalDistance" : "verticalDistance";
      kept.push({ ...c, kind, value: (c.value ?? 0) * sign }); if (kind !== c.kind || sign < 0) changed.push({ id: c.id, from: c.kind, to: `${kind}${sign < 0 ? " (the other way)" : ""}` });
    } else if (c.kind === "angle") {
      kept.push(mirrored ? { ...c, value: -(c.value ?? 0) } : c); if (mirrored) changed.push({ id: c.id, from: "angle", to: "angle (the other way)" });
    } else if (c.kind === "fixed") {
      const at = c.at ?? [0, 0], to: [number, number] = [M[0][0] * at[0] + M[0][1] * at[1] + (m.by?.[0] ?? 0), M[1][0] * at[0] + M[1][1] * at[1] + (m.by?.[1] ?? 0)]; kept.push({ ...c, at: to }); changed.push({ id: c.id, from: "fixed", to: `fixed at ${to[0].toFixed(3)}, ${to[1].toFixed(3)}` });
    } else kept.push(c);
  }
  void turned;
  // what the dropped relations said among themselves: the level sides are parallel to each other, the upright ones too, and the two kinds are square
  const chain = (lines: string[], tag: string) => { for (let i = 1; i < lines.length; i++) { const id = `${tag}${i}`; kept.push({ id, kind: "parallel", parts: [lines[i - 1]!, lines[i]!] }); changed.push({ id, from: "level/upright", to: "parallel" }); } };
  chain([...new Set(levels)], "keep.level."); chain([...new Set(uprights)], "keep.upright.");
  if (levels.length && uprights.length) { kept.push({ id: "keep.square", kind: "perpendicular", parts: [levels[0]!, uprights[0]!] }); changed.push({ id: "keep.square", from: "level/upright", to: "perpendicular" }); }
  return { kept, dropped, changed };
}
/** the definition of a sketch after a motion: the points moved, the constraints carried, the anchors and what held to them left behind (a body's edge is not in the copy) */
export function moveDefinition(p: SketchParams, m: Motion): { params: SketchParams; dropped: { id: string; kind: string; why: string }[]; changed: { id: string; from: string; to: string }[] } {
  const M = matrix(m), by = m.by ?? [0, 0], mv = (x: number, y: number): [number, number] => [M[0][0] * x + M[0][1] * y + by[0], M[1][0] * x + M[1][1] * y + by[1]];
  const anchors = new Set([...(p.anchors ?? []).flatMap((a) => [a.id, `${a.id}.a`, `${a.id}.b`])]), lines = p.lines ?? [], lineOfPoints = (a: string, b: string) => lines.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))?.id ?? null;
  const usesAnchor = (c: Constraint) => c.parts.some((q) => anchors.has(q)), held = (p.constraints ?? []).filter((c) => !usesAnchor(c)), gone = (p.constraints ?? []).filter(usesAnchor);
  const carried = carryConstraints(held, lineOfPoints, m);
  const dropped = [...carried.dropped, ...gone.map((c) => ({ id: c.id, kind: c.kind, why: "it holds to a body's edge, which is not in the copy" }))];
  const circles = (p.circles ?? []).map((c) => ({ ...c })), points = p.points.map((q) => { const [x, y] = mv(q.x, q.y); return { ...q, x, y }; });
  const { anchors: _a, ...rest } = p; void _a;
  const flips = M[0][0] * M[1][1] - M[0][1] * M[1][0] < 0; // a mirror turns the way an arc goes
  const arcs = (p.arcs ?? []).map((a) => ({ ...a, ...(flips ? { cw: !a.cw } : {}) })), pick = (p.pick ?? []).map(([x, y]) => mv(x, y));
  return { params: { ...rest, points, circles, ...(p.arcs ? { arcs } : {}), ...(p.pick ? { pick } : {}), constraints: carried.kept }, dropped, changed: carried.changed };
}
/** a copy of a constrained sketch, moved: its constraints carried (E59); it follows the sketch it copies when that is edited */
kinds["sketchCopy"] = { outputs: "sketch", run: (inputs, { step }) => {
  const src = inputs[0] as Sketch | undefined; if (!src || src.kind !== "sketch" || !src.definition) throw new Error("this is a copy of a constrained sketch: the step before it is not one");
  const body = inputs[1] instanceof Body ? inputs[1] : null, moved = moveDefinition(src.definition as SketchParams, step.params as Motion);
  const out = makeSketch(moved.params, body, step); return { ...out, carried: { dropped: moved.dropped, changed: moved.changed } } as Sketch;
} };
