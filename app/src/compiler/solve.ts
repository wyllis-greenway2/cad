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

/** Build and solve the system of one plane. Returns the new 2D positions of its variable corners. */
function solvePlane(scene: Scene, get: Lookup, plane: Plane, rels: Relation[]) {
  const f = new Frame(plane);
  const points: Record<string, [number, number]> = {};
  const scalars: Record<string, number> = {};
  const cons: SolverConstraint[] = [];
  const variable = new Set<Ref>();
  const virtual = new Set<Ref>();

  const cornerId = (ref: Ref): string | null => {
    const p = get(ref);
    if (!p || p.kind !== "corner") return null;
    if (!(ref in points)) {
      points[ref] = f.to2d(p.at);
      if (p.movable && p.plane === plane.ref) variable.add(ref);
      else {
        virtual.add(ref);
        cons.push({ id: `~v:${ref}`, type: "fixed", p: ref, at: points[ref] });
      }
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

  const kindOf = (r: Ref) => get(r)?.kind;
  let softN = 0;
  for (const rel of rels) {
    const parts = rel.parts;
    const ids = (k: "corner" | "line") => parts.filter((p) => kindOf(p) === k);
    const [c1, c2] = ids("corner");
    const [l1, l2] = ids("line");
    const L1 = l1 ? lineIds(l1) : null;
    const L2 = l2 ? lineIds(l2) : null;
    const id = rel.id;
    const v = rel.value;
    const side = rel.params?.side ?? 1;
    const add1 = (c: Omit<SolverConstraint, "id">) => cons.push({ id, ...c } as SolverConstraint);
    switch (rel.kind) {
      case "horizontal": case "vertical":
        if (L1) add1({ type: rel.kind, a: L1[0], b: L1[1] });
        break;
      case "fixed": {
        const c = c1 ? cornerId(c1) : null;
        if (c) add1({ type: "fixed", p: c, at: points[c] });
        break;
      }
      case "coincident": case "sameHeight": case "sameAcross": {
        const a = c1 ? cornerId(c1) : null;
        const b = c2 ? cornerId(c2) : null;
        if (a && b) add1({ type: rel.kind === "coincident" ? "coincident" : rel.kind === "sameHeight" ? "horizontal" : "vertical", a, b });
        break;
      }
      case "distance": {
        if (c1 && c2 && v !== undefined) add1({ type: "distance", a: cornerId(c1)!, b: cornerId(c2)!, d: v });
        else if (c1 && L1 && v !== undefined) add1({ type: "ptLineDist", p: cornerId(c1)!, a: L1[0], b: L1[1], d: v, side });
        else if (L1 && L2 && v !== undefined) add1({ type: "lineGap", a: L1[0], b: L1[1], c: L2[0], d: L2[1], dist: v, side });
        break;
      }
      case "equalLength": case "parallel": case "perpendicular":
        if (L1 && L2) add1({ type: rel.kind, a: L1[0], b: L1[1], c: L2[0], d: L2[1] });
        break;
      case "angle": {
        if (!L1 || !L2 || v === undefined) break;
        const shared = L1.find((p) => L2.includes(p));
        if (!shared) break;
        const p = L1.find((x) => x !== shared)!;
        const q = L2.find((x) => x !== shared)!;
        add1({ type: "angle", a: shared, b: p, c: shared, d: q, value: (side * v * Math.PI) / 180 });
        break;
      }
      case "equalRadius": {
        const circles = parts.filter((p) => kindOf(p) === "circle");
        const r = circles[0] ? radiusId(circles[0]) : null;
        const s = circles[1] ? radiusId(circles[1]) : null;
        if (r && s) add1({ type: "equalRadius", r, s });
        break;
      }
    }
    // the second part is the reference: held softly where it is, so the first part moves
    for (const refPart of parts.slice(1)) {
      const pts = kindOf(refPart) === "corner" ? [cornerId(refPart)] : kindOf(refPart) === "line" ? (lineIds(refPart) ?? []) : [];
      for (const p of pts) if (p && variable.has(p as Ref)) cons.push({ id: `~soft${softN++}`, type: "fixed", p, at: points[p]!, w: REFERENCE_WEIGHT });
    }
  }
  const result = solve({ points, scalars }, cons);
  return { f, result, variable };
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
    const { f, result, variable } = solvePlane(scene, get, plane, rels);
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
