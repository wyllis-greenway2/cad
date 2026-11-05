// Solving relations into positions (`dec_clean_engine_design` section 7). For each plane: the drawn corners on it become variables; every other part a
// relation refers to (body corners and lines, world parts, parts on other planes) becomes a fixed virtual part at its projection on this plane.
// The second part of a relation is held softly, so the first moves (`in_090`). The result is a list of movePart commands, so history records it.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, add, scale } from "../math/vec.ts";
import type { Scene, Relation } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Plane, Lookup } from "../operation/part.ts";
import { planeOfParts, pointOf } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { apply } from "../operation/commands.ts";
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
    if (!l || l.kind !== "line") return null;
    const a = cornerId(l.a);
    const b = cornerId(l.b);
    return a && b ? [a, b] : null;
  };
  const radiusId = (ref: Ref): string | null => {
    const c = get(ref);
    if (!c || c.kind !== "circle") return null;
    cornerId(c.center);
    scalars[ref] = c.radius;
    return ref;
  };
  return { frame, get, points, scalars, cons, variable, cornerId, lineIds, radiusId };
}

/** The solver constraint a relation means, or null if it cannot be made (a part is missing, a number is not set). */
function constraintFor(m: Model, rel: Relation): Omit<SolverConstraint, "id"> | null {
  const kindOf = (r: Ref) => m.get(r)?.kind;
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
function solvePlane(get: Lookup, plane: Plane, rels: Relation[]) {
  const m = newModel(get, plane);
  let soft = 0;
  for (const rel of rels) {
    if (rel.locked === false) continue; // an unlocked number is a measurement only (`dec_relations_standard`: measure, then lock)
    const c = constraintFor(m, rel);
    if (c) m.cons.push({ id: rel.id, ...c } as SolverConstraint);
    // the second part is the reference: held softly where it is, so the first part moves
    for (const refPart of rel.parts.slice(1)) {
      const kind = get(refPart)?.kind;
      const pts = kind === "corner" ? [m.cornerId(refPart)] : kind === "line" ? (m.lineIds(refPart) ?? []) : [];
      for (const p of pts) if (p && m.variable.has(p as Ref)) m.cons.push({ id: `~soft${soft++}`, type: "fixed", p, at: m.points[p]!, w: REFERENCE_WEIGHT });
    }
  }
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
  let cur = scene;
  for (const [planeRef, rels] of byPlane) {
    const plane = get(planeRef) as Plane;
    const { f, result, variable } = solvePlane(get, plane, rels);
    const clean = (ids: string[]) => ids.filter((i) => !i.startsWith("~"));
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
