// Solving relations into positions (`dec_clean_engine_design` section 7). For each plane: the drawn corners on it become variables; every other part a
// relation refers to (body corners and lines, world parts, parts on other planes) becomes a fixed virtual part at its projection on this plane.
// The parts of a relation after the first are held softly, so the first moves (a relation lists the part selected first first, `in_229`). The result is a list of movePart commands, so history records it.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, add, scale } from "../math/vec.ts";
import type { Scene, Relation } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Plane, Lookup } from "../operation/part.ts";
import { planeOfParts, pointOf, roundOf, relationKind, traceOfFace } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { apply } from "../operation/commands.ts";
import { consumed } from "../operation/ownership.ts";
import { solve } from "./solver/solver.mjs";
import type { SolverConstraint } from "./solver/solver.mjs";

const REFERENCE_WEIGHT = 0.2; // how firmly the second part of a relation stays where it is (soft: hard relations win)

export interface PlaneReport {
  plane: Ref;
  status: "ok" | "conflict";
  dof: number | null;
  /** Relations that conflict (the solver could not satisfy them together) or are redundant. */
  conflicts: string[];
  redundant: string[];
}
export interface SolveOutcome {
  /** The scene with the solved positions (the original if nothing changed). */
  scene: Scene;
  /** The corner moves, as commands (empty if nothing moved). */
  moves: Command[];
  planes: PlaneReport[];
  /** Relations that could not be placed on any plane (none of their parts lies on one). */
  unplaced: string[];
}

class Frame {
  readonly plane: Plane;
  constructor(plane: Plane) {
    this.plane = plane;
  }
  to2d(p: Vec3): [number, number] {
    const d = sub(p, this.plane.at);
    return [dot(d, this.plane.u), dot(d, this.plane.v)];
  }
  to3d(q: readonly [number, number], like: Vec3): Vec3 {
    // keep the part's offset along the plane normal (a corner stays at its height)
    const onPlane = add(this.plane.at, add(scale(this.plane.u, q[0]), scale(this.plane.v, q[1])));
    const d = sub(like, this.plane.at);
    const along = sub(d, add(scale(this.plane.u, dot(d, this.plane.u)), scale(this.plane.v, dot(d, this.plane.v))));
    return add(onPlane, along);
  }
}

/** The 2D system of one plane being built: the corners that can move, the fixed virtual copies of everything else, and the constraints. */
interface Model {
  frame: Frame;
  get: Lookup;
  points: Record<string, [number, number]>;
  scalars: Record<string, number>;
  cons: SolverConstraint[];
  variable: Set<Ref>;
  cornerId(ref: Ref): string | null;
  lineIds(ref: Ref): [string, string] | null;
  radiusId(ref: Ref): string | null;
  /** the centre of a circle (a corner id): of a drawn circle, or of a circular edge of a body, which is a fixed virtual corner (an anchor, `in_308`) */
  roundCentre(ref: Ref): string | null;
}

function newModel(get: Lookup, plane: Plane): Model {
  const frame = new Frame(plane);
  const points: Record<string, [number, number]> = {};
  const scalars: Record<string, number> = {};
  const cons: SolverConstraint[] = [];
  const variable = new Set<Ref>();
  const cornerId = (ref: Ref): string | null => {
    const p = get(ref);
    if (!p || p.kind !== "corner") return null;
    if (!(ref in points)) {
      points[ref] = frame.to2d(p.at);
      // a corner of this plane can move; any other (a body corner, a world part, a part on another plane) is a fixed virtual copy at its projection
      if (p.movable && p.plane === plane.ref) variable.add(ref);
      else cons.push({ id: `~v:${ref}`, type: "fixed", p: ref, at: points[ref] });
    }
    return ref;
  };
  const lineIds = (ref: Ref): [string, string] | null => {
    const l = get(ref);
    if (l?.kind === "plane" && l.origin === "body") { // a flat face of the body: the line where it cuts this plane, held fixed (`in_313`)
      const t = traceOfFace(l, plane);
      if (!t) return null;
      const ids: [string, string] = [`~t0:${ref}`, `~t1:${ref}`];
      for (const [i, id] of ids.entries()) if (!(id in points)) { points[id] = frame.to2d(t[i]!); cons.push({ id: `~anchor:${id}`, type: "fixed", p: id, at: points[id]! }); }
      return ids;
    }
    if (!l || l.kind !== "line") return null;
    const a = cornerId(l.a);
    const b = cornerId(l.b);
    return a && b ? [a, b] : null;
  };
  const roundCentre = (ref: Ref): string | null => {
    const c = get(ref);
    if (c?.kind === "circle") return cornerId(c.center);
    const a = relationKind(get, ref) === "circle" ? roundOf(get, ref) : null; // (a circular edge of a body: read, never moved)
    if (!a) return null;
    const id = `~c:${ref}`;
    if (!(id in points)) { points[id] = frame.to2d(a.center); cons.push({ id: `~anchor:${id}`, type: "fixed", p: id, at: points[id]! }); }
    return id;
  };
  const radiusId = (ref: Ref): string | null => {
    const c = get(ref);
    if (c?.kind === "circle") { cornerId(c.center); scalars[ref] = c.radius; return ref; }
    const a = relationKind(get, ref) === "circle" ? roundOf(get, ref) : null;
    if (!a) return null;
    if (!(ref in scalars)) { scalars[ref] = a.radius; cons.push({ id: `~anchor:r:${ref}`, type: "radius", r: ref, value: a.radius }); }
    return ref;
  };
  return { frame, get, points, scalars, cons, variable, cornerId, lineIds, radiusId, roundCentre };
}

/** The solver constraint a relation means, or null if it cannot be made (a part is missing, a number is not set). */
function constraintFor(m: Model, rel: Relation): Omit<SolverConstraint, "id"> | null {
  const kindOf = (r: Ref) => (m.get(r) ? relationKind(m.get, r, m.frame.plane) : undefined); // (a circular edge of a body is a circle: an anchor)
  const ofKind = (k: "corner" | "line" | "circle") => rel.parts.filter((p) => kindOf(p) === k);
  const [c1, c2] = ofKind("corner");
  const [l1, l2] = ofKind("line");
  const [k1, k2] = ofKind("circle");
  const L1 = l1 ? m.lineIds(l1) : null;
  const L2 = l2 ? m.lineIds(l2) : null;
  const v = rel.value;
  const side = rel.params?.side ?? 1;
  switch (rel.kind) {
    case "horizontal": case "vertical":
      return L1 ? { type: rel.kind, a: L1[0], b: L1[1] } : null;
    case "length":
      return L1 && v !== undefined ? { type: "distance", a: L1[0], b: L1[1], d: v } : null;
    case "diameter": {
      const r = k1 ? m.radiusId(k1) : null;
      return r && v !== undefined ? { type: "radius", r, value: v / 2 } : null;
    }
    case "fixed": {
      const c = c1 ? m.cornerId(c1) : null;
      return c ? { type: "fixed", p: c, at: m.points[c] } : null;
    }
    case "coincident": case "sameHeight": case "sameAcross": {
      const a = c1 ? m.cornerId(c1) : null;
      const b = c2 ? m.cornerId(c2) : null;
      return a && b ? { type: rel.kind === "coincident" ? "coincident" : rel.kind === "sameHeight" ? "horizontal" : "vertical", a, b } : null;
    }
    case "distance": {
      if (v === undefined) return null;
      if (c1 && c2) return { type: "distance", a: m.cornerId(c1)!, b: m.cornerId(c2)!, d: v };
      if (c1 && L1) return { type: "ptLineDist", p: m.cornerId(c1)!, a: L1[0], b: L1[1], d: v, side };
      if (L1 && L2) return { type: "lineGap", a: L1[0], b: L1[1], c: L2[0], d: L2[1], dist: v, side };
      return null;
    }
    case "equalLength": case "parallel": case "perpendicular":
      return L1 && L2 ? { type: rel.kind, a: L1[0], b: L1[1], c: L2[0], d: L2[1] } : null;
    case "angle": {
      if (!L1 || !L2 || v === undefined) return null;
      const shared = L1.find((p) => L2.includes(p));
      if (!shared) return null;
      return { type: "angle", a: shared, b: L1.find((x) => x !== shared)!, c: shared, d: L2.find((x) => x !== shared)!, value: (side * v * Math.PI) / 180 };
    }
    case "arcEnds": {
      // the two ends of an arc are the same distance from its centre
      const ar = l1 ? m.get(l1) : null;
      const cen = c1 ? m.cornerId(c1) : null;
      return ar && cen && L1 ? { type: "equalLength", a: L1[0], b: cen, c: L1[1], d: cen } : null;
    }
    case "radius": {
      // the radius of an arc: the distance from its centre to its start
      const ar = l1 ? m.get(l1) : null;
      const cen = ar && ar.kind === "line" && ar.center ? m.cornerId(ar.center) : null;
      return L1 && cen && v !== undefined ? { type: "distance", a: L1[0], b: cen, d: v } : null;
    }
    case "onLine": {
      const p = c1 ? m.cornerId(c1) : null;
      return p && L1 ? { type: "ptOnLine", p, a: L1[0], b: L1[1] } : null;
    }
    case "onCircle": {
      const p = c1 ? m.cornerId(c1) : null;
      if (!p) return null;
      if (k1) { const r = m.radiusId(k1); const cen = m.roundCentre(k1); return r && cen ? { type: "ptOnCircle", p, c: cen, r } : null; }
      const ar = l1 ? m.get(l1) : null;
      const cen = ar && ar.kind === "line" && ar.center ? m.cornerId(ar.center) : null;
      const e = ar && ar.kind === "line" && cen ? m.cornerId(ar.a) : null;
      return cen && e ? { type: "ptOnCircle", p, c: cen, e } : null;
    }
    case "tangent": {
      // two circles or arcs that touch (`in_292`, `in_338`): the distance between their centres is the sum of their radii (outside each other) or their difference (one inside the other), as they are now. An arc's radius is
      // the distance from its centre to its start, so this holds wherever the arcs end: nothing about the touching point is asked of an end (a trim or a dragged end cannot make it impossible)
      const round = (ref: Ref): { c: string; r?: string; e?: string } | null => {
        const k = kindOf(ref);
        if (k === "circle") { const [c, r] = [m.roundCentre(ref), m.radiusId(ref)]; return c && r ? { c, r } : null; }
        const p = k === "line" ? m.get(ref) : undefined;
        if (p?.kind === "line" && p.center) { const [c, e] = [m.cornerId(p.center), m.cornerId(p.a)]; return c && e ? { c, e } : null; }
        return null;
      };
      const [x, y] = rel.parts.length === 2 ? [round(rel.parts[0]!), round(rel.parts[1]!)] : [null, null];
      if (x && y) {
        const size = (q: { c: string; r?: string; e?: string }): number => (q.r ? m.scalars[q.r]! : Math.hypot(m.points[q.e!]![0] - m.points[q.c]![0], m.points[q.e!]![1] - m.points[q.c]![1]));
        const d = Math.hypot(m.points[x.c]![0] - m.points[y.c]![0], m.points[x.c]![1] - m.points[y.c]![1]);
        const [s1, s2] = [size(x), size(y)];
        return { type: "tangentCircles", a: x.c, b: y.c, ...(x.r ? { r: x.r } : { ea: x.e }), ...(y.r ? { s: y.r } : { eb: y.e }), mode: Math.abs(d - (s1 + s2)) <= Math.abs(d - Math.abs(s1 - s2)) ? 1 : -1 } as Omit<SolverConstraint, "id">;
      }
      // a line touches a circle, or an arc
      if (L1 && k1) { const r = m.radiusId(k1); const cen = m.roundCentre(k1); return r && cen ? { type: "tangentCircle", a: L1[0], b: L1[1], c: cen, r } : null; }
      const [x1, x2] = [l1 ? m.get(l1) : null, l2 ? m.get(l2) : null];
      const arc = x1?.kind === "line" && x1.center ? x1 : x2?.kind === "line" && x2.center ? x2 : null;
      const straight = arc && arc === x1 ? L2 : L1;
      const cen = arc ? m.cornerId(arc.center!) : null;
      const arcEnd = arc ? m.cornerId(arc.a) : null;
      return straight && cen && arcEnd ? { type: "tangentArc", a: straight[0], b: straight[1], c: cen, p: arcEnd } : null;
    }
    case "concentric": {
      const a = k1 ? m.roundCentre(k1) : null;
      const b = k2 ? m.roundCentre(k2) : null;
      return a && b ? { type: "coincident", a, b } : null;
    }
    case "equalRadius": {
      const r = k1 ? m.radiusId(k1) : null;
      const q = k2 ? m.radiusId(k2) : null;
      return r && q ? { type: "equalRadius", r, s: q } : null;
    }
    default:
      return null;
  }
}

/** Build and solve the system of one plane. Returns the solver's result and which corners were free to move. */
function solvePlane(get: Lookup, plane: Plane, rels: Relation[], used: ReadonlySet<Ref>) {
  const m = newModel(get, plane);
  let soft = 0;
  let hold = 0;
  for (const rel of rels) {
    if (rel.locked === false) continue; // an unlocked number is a measurement only (`dec_relations_standard`: measure, then lock)
    const c = constraintFor(m, rel);
    if (c) m.cons.push({ id: rel.id, ...c } as SolverConstraint);
    // a constraint between what built the body and something else (a free drawing, the world, the body) is a constraint of the whole body to that thing: the body's sketch is held where it is, so a move of the body
    // that would break it is refused and the constraint flashes, instead of the sketch being pulled back out of the body (`in_205`)
    if (rel.parts.some((q) => used.has(q)) && rel.parts.some((q) => !used.has(q))) {
      for (const part of rel.parts.filter((q) => used.has(q))) {
        const kind = get(part)?.kind;
        const line = kind === "line" ? m.get(part) : null;
        const centre = line?.kind === "line" && line.center ? m.cornerId(line.center) : null;
        const pts = kind === "corner" ? [m.cornerId(part)] : kind === "line" ? [...(m.lineIds(part) ?? []), ...(centre ? [centre] : [])] : kind === "circle" ? [m.roundCentre(part)] : [];
        for (const p of pts) if (p && m.variable.has(p as Ref)) m.cons.push({ id: `~hold${hold++}`, type: "fixed", p, at: m.points[p]! });
        if (kind === "circle" && part in m.scalars) m.cons.push({ id: `~hold${hold++}`, type: "radius", r: part, value: m.scalars[part]! });
      }
    }
    // the parts after the first are the references: held softly where they are, so the first part (the one selected last) moves
    for (const refPart of rel.parts.slice(1)) {
      const kind = get(refPart)?.kind;
      const refLine = kind === "line" ? m.get(refPart) : null;
      const arcCentre = refLine?.kind === "line" && refLine.center ? m.cornerId(refLine.center) : null; // (an arc held softly holds its centre too)
      const pts = kind === "corner" ? [m.cornerId(refPart)] : kind === "line" ? [...(m.lineIds(refPart) ?? []), ...(arcCentre ? [arcCentre] : [])] : kind === "circle" ? [m.roundCentre(refPart)] : [];
      for (const p of pts) if (p && m.variable.has(p as Ref)) m.cons.push({ id: `~soft${soft++}`, type: "fixed", p, at: m.points[p]!, w: REFERENCE_WEIGHT });
    }
  }
  // a circle keeps its size unless a relation says otherwise (a weak hold: any relation that sets or ties a radius wins)
  for (const [id, radius] of Object.entries(m.scalars)) m.cons.push({ id: `~size:${id}`, type: "radius", r: id, value: radius, w: 0.3 });
  return { f: m.frame, result: solve({ points: m.points, scalars: m.scalars }, m.cons), variable: m.variable };
}

/** Solve every relation in the scene, plane by plane. A conflict leaves that plane unchanged and names the relations involved. */
export function solveScene(scene: Scene): SolveOutcome {
  const get = lookup(scene);
  const byPlane = new Map<Ref, Relation[]>();
  const unplaced: string[] = [];
  for (const rel of scene.relations) {
    const pl = planeOfParts(get, rel.parts);
    if (!pl) unplaced.push(rel.id);
    else byPlane.set(pl.ref, [...(byPlane.get(pl.ref) ?? []), rel]);
  }
  const reports: PlaneReport[] = [];
  const moves: Command[] = [];
  const used = consumed(scene);
  let cur = scene;
  for (const [planeRef, rels] of byPlane) {
    const plane = get(planeRef) as Plane;
    const { f, result, variable } = solvePlane(get, plane, rels, used);
    const clean = (ids: string[]) => ids.filter((i) => !i.startsWith("~"));
    // a side that the constraints would shrink to nothing (a side held level and upright at once, or two sides held parallel and square: "solved" by a side of no length) is a conflict, not an answer: the
    // sketch stays as it is and the relations that meet at that side are named (`in_254`: it left a rectangle whose extrusion the kernel reported as "this object has been deleted")
    const collapsed = result.status === "ok" ? Object.values(scene.parts).filter((l): l is Extract<typeof l, { kind: "line" }> => {
      if (l.kind !== "line" || l.origin !== "drawn" || l.derived || l.center || l.bulge || l.plane !== planeRef) return false;
      const [a, b, a0, b0] = [result.points[l.a], result.points[l.b], pointOf(get, l.a), pointOf(get, l.b)];
      if (!a || !b || !a0 || !b0) return false;
      const [p0, q0] = [f.to2d(a0), f.to2d(b0)];
      return Math.hypot(p0[0] - q0[0], p0[1] - q0[1]) > 1e-6 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
    }) : [];
    if (collapsed.length) {
      const involved = rels.filter((r) => collapsed.some((l) => r.parts.includes(l.ref) || r.parts.includes(l.a) || r.parts.includes(l.b))).map((r) => r.id);
      reports.push({ plane: planeRef, status: "conflict", dof: null, conflicts: involved, redundant: [] });
      continue;
    }
    reports.push({ plane: planeRef, status: result.status, dof: result.dof, conflicts: clean(result.conflicts), redundant: clean(result.redundant) });
    if (result.status !== "ok") continue;
    for (const ref of variable) {
      const old = pointOf(get, ref)!;
      const to = f.to3d(result.points[ref]!, old);
      if (Math.hypot(to[0] - old[0], to[1] - old[1], to[2] - old[2]) < 1e-9) continue;
      const cmd: Command = { type: "movePart", ref, to };
      const r = apply(cur, cmd);
      if (r.ok) {
        cur = r.value;
        moves.push(cmd);
      }
    }
    // a circle's radius follows an equalRadius relation
    for (const [id, radius] of Object.entries(result.scalars)) {
      const c = cur.parts[id];
      if (c && c.kind === "circle" && Math.abs(c.radius - radius) > 1e-9) cur = { ...cur, parts: { ...cur.parts, [id]: { ...c, radius } } };
    }
  }
  return { scene: cur, moves, planes: reports, unplaced };
}
