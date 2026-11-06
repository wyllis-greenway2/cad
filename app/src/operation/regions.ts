// Regions (`in_178`, `in_183`): lines, arcs and circles drawn on one plane that cross, touch or end on each other cut the plane into pieces, and each piece is a face of its own.
// The drawing is split at every crossing and every place where an end of one curve lies on another, and the faces are found by walking round what is left.
// The pieces and the crossing points are derived parts (`derived`: made when the faces are, never saved, not picked), so a face is a loop of ordinary parts and an extrude names them like any other.
import type { Ref } from "../shared/ref.ts";
import { ref as mkRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot } from "../math/vec.ts";
import type { Lookup, Face, Part, Line, Corner } from "./part.ts";
import { pointOf, normalOfPlane, loopPoints } from "./part.ts";
import type { Scene } from "./scene.ts";

type V2 = [number, number];
type Curve =
  | { k: "seg"; ref: Ref; a: Ref; b: Ref; p: V2; q: V2 }
  | { k: "arc"; ref: Ref; a: Ref; b: Ref; centre: Ref; c: V2; r: number; a0: number; sweep: number; p: V2; q: V2 }
  | { k: "circle"; ref: Ref; centre: Ref; c: V2; r: number };
interface Node { ref: Ref; at: V2; part?: Corner }
interface Piece { curve: Curve; from: Ref; to: Ref; ref: Ref; arc: boolean; ccw: boolean; whole: boolean }
interface Half { from: Ref; to: Ref; piece: Piece; dir: number; twin: number }

const TOL = 1e-4;
const TAU = 2 * Math.PI;
const mod = (x: number) => ((x % TAU) + TAU) % TAU;
const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ang = (c: V2, p: V2) => Math.atan2(p[1] - c[1], p[0] - c[0]);

/** Where along the curve a point is (0 to 1 for a side or an arc, the angle for a circle), or null if it is not on it. */
function along(cu: Curve, pt: V2): number | null {
  if (cu.k === "seg") {
    const d: V2 = [cu.q[0] - cu.p[0], cu.q[1] - cu.p[1]];
    const len2 = d[0] * d[0] + d[1] * d[1];
    if (len2 < 1e-18) return null;
    const t = ((pt[0] - cu.p[0]) * d[0] + (pt[1] - cu.p[1]) * d[1]) / len2;
    const foot: V2 = [cu.p[0] + d[0] * t, cu.p[1] + d[1] * t];
    return dist(foot, pt) <= TOL && t >= -TOL / Math.sqrt(len2) && t <= 1 + TOL / Math.sqrt(len2) ? Math.min(1, Math.max(0, t)) : null;
  }
  if (Math.abs(dist(cu.c, pt) - cu.r) > TOL) return null;
  if (cu.k === "circle") return mod(ang(cu.c, pt));
  const turn = cu.sweep > 0 ? mod(ang(cu.c, pt) - cu.a0) : mod(cu.a0 - ang(cu.c, pt));
  const e = TOL / cu.r;
  const d = turn > TAU - e ? turn - TAU : turn; // (just before the start is the start)
  const f = d / Math.abs(cu.sweep);
  const slack = e / Math.abs(cu.sweep);
  return f >= -slack && f <= 1 + slack ? Math.min(1, Math.max(0, f)) : null;
}

/** The points where two curves meet (as whole lines and circles; `along` then says which of them are on the real curves). */
function meet(x: Curve, y: Curve): V2[] {
  const line = (c: Curve): c is Extract<Curve, { k: "seg" }> => c.k === "seg";
  if (line(x) && line(y)) {
    const d1: V2 = [x.q[0] - x.p[0], x.q[1] - x.p[1]];
    const d2: V2 = [y.q[0] - y.p[0], y.q[1] - y.p[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12) return [];
    const t = ((y.p[0] - x.p[0]) * d2[1] - (y.p[1] - x.p[1]) * d2[0]) / den;
    return [[x.p[0] + d1[0] * t, x.p[1] + d1[1] * t]];
  }
  if (line(x) !== line(y)) {
    const s = (line(x) ? x : y) as Extract<Curve, { k: "seg" }>;
    const c = (line(x) ? y : x) as Exclude<Curve, { k: "seg" }>;
    const d: V2 = [s.q[0] - s.p[0], s.q[1] - s.p[1]];
    const f: V2 = [s.p[0] - c.c[0], s.p[1] - c.c[1]];
    const A = d[0] * d[0] + d[1] * d[1];
    const B = 2 * (f[0] * d[0] + f[1] * d[1]);
    const C = f[0] * f[0] + f[1] * f[1] - c.r * c.r;
    const disc = B * B - 4 * A * C;
    if (A < 1e-18 || disc < -1e-9) return [];
    const root = Math.sqrt(Math.max(0, disc));
    const ts = disc < 1e-12 ? [-B / (2 * A)] : [(-B - root) / (2 * A), (-B + root) / (2 * A)];
    return ts.map((t): V2 => [s.p[0] + d[0] * t, s.p[1] + d[1] * t]);
  }
  const [a, b] = [x as Exclude<Curve, { k: "seg" }>, y as Exclude<Curve, { k: "seg" }>];
  const D = dist(a.c, b.c);
  if (D < 1e-9 || D > a.r + b.r + TOL || D < Math.abs(a.r - b.r) - TOL) return [];
  const l = (a.r * a.r - b.r * b.r + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, a.r * a.r - l * l));
  const m: V2 = [a.c[0] + ((b.c[0] - a.c[0]) * l) / D, a.c[1] + ((b.c[1] - a.c[1]) * l) / D];
  const n: V2 = [-(b.c[1] - a.c[1]) / D, (b.c[0] - a.c[0]) / D];
  return h < 1e-9 ? [m] : [[m[0] + n[0] * h, m[1] + n[1] * h], [m[0] - n[0] * h, m[1] - n[1] * h]];
}

export interface Regions { faces: Face[]; parts: Part[]; taken: Set<Ref> }

/** The faces of the plane's drawing wherever the curves cross, touch or end on each other (anything that is not just separate closed shapes). */
export function regionsOf(s: Scene): Regions {
  const res: Regions = { faces: [], parts: [], taken: new Set() };
  const get: Lookup = (r) => s.parts[r];
  const planes = new Set<Ref>();
  for (const p of Object.values(s.parts)) if ((p.kind === "line" || p.kind === "circle") && p.origin === "drawn" && p.plane && !(p.kind === "line" && p.derived)) planes.add(p.plane);
  for (const plRef of planes) {
    const pl = get(plRef);
    if (!pl || pl.kind !== "plane") continue;
    const n = normalOfPlane(pl);
    const flat = (q: Vec3): V2 => [dot(sub(q, pl.at), pl.u), dot(sub(q, pl.at), pl.v)];
    const pos = (r: Ref): V2 | null => { const q = pointOf(get, r); return q && Math.abs(dot(sub(q, pl.at), n)) < 1e-6 ? flat(q) : null; };
    // the curves
    const curves: Curve[] = [];
    for (const p of Object.values(s.parts)) {
      if (p.origin !== "drawn" || p.plane !== plRef) continue;
      if (p.kind === "circle") {
        const c = pos(p.center);
        if (c && p.radius > TOL) curves.push({ k: "circle", ref: p.ref, centre: p.center, c, r: p.radius });
      } else if (p.kind === "line" && !p.derived && !p.bulge) {
        const [a, b] = [pos(p.a), pos(p.b)];
        if (!a || !b || p.a === p.b) continue;
        if (!p.center) { curves.push({ k: "seg", ref: p.ref, a: p.a, b: p.b, p: a, q: b }); continue; }
        const c = pos(p.center);
        if (!c) continue;
        const [a0, a1] = [ang(c, a), ang(c, b)];
        const sweep = p.ccw === false ? -mod(a0 - a1) : mod(a1 - a0);
        if (Math.abs(sweep) < 1e-9) continue;
        curves.push({ k: "arc", ref: p.ref, a: p.a, b: p.b, centre: p.center, c, r: dist(c, a), a0, sweep, p: a, q: b });
      }
    }
    if (curves.length < 2) continue;
    curves.sort((x, y) => (x.ref < y.ref ? -1 : 1));
    // the nodes: the ends of the curves, the places where curves cross, and the places where an end of one lies on another
    const nodes: Node[] = [];
    const nodeAt = (pt: V2, ref?: Ref, make?: () => Corner): Node => {
      const have = nodes.find((m) => dist(m.at, pt) <= TOL);
      if (have) return have;
      const node: Node = { ref: ref!, at: pt, ...(make ? { part: make() } : {}) };
      nodes.push(node);
      return node;
    };
    const ends = new Map<Ref, V2>();
    for (const c of curves) if (c.k !== "circle") { ends.set(c.a, c.p); ends.set(c.b, c.q); }
    for (const [r, at] of [...ends].sort((x, y) => (x[0] < y[0] ? -1 : 1))) nodeAt(at, r);
    const cuts = new Map<Ref, Map<Ref, number>>(); // curve -> node -> where along it
    const cutAt = (cu: Curve, node: Node, t: number) => { const m = cuts.get(cu.ref) ?? new Map<Ref, number>(); if (!m.has(node.ref)) m.set(node.ref, t); cuts.set(cu.ref, m); };
    for (const c of curves) if (c.k !== "circle") { cutAt(c, nodeAt(c.p), 0); cutAt(c, nodeAt(c.q), 1); }
    for (const nd of [...nodes]) for (const c of curves) { const t = along(c, nd.at); if (t !== null) cutAt(c, nd, t); }
    for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
      const [x, y] = [curves[i]!, curves[j]!];
      const pts = meet(x, y).filter((q) => along(x, q) !== null && along(y, q) !== null).sort((u, v) => u[0] - v[0] || u[1] - v[1]);
      pts.forEach((q, k) => {
        const name = mkRef(`d/x@${x.ref.slice(2)}@${y.ref.slice(2)}@${k}`);
        const at3: Vec3 = [pl.at[0] + pl.u[0] * q[0] + pl.v[0] * q[1], pl.at[1] + pl.u[1] * q[0] + pl.v[1] * q[1], pl.at[2] + pl.u[2] * q[0] + pl.v[2] * q[1]];
        const node = nodeAt(q, name, () => ({ origin: "drawn", movable: false, plane: plRef, derived: true, ref: name, kind: "corner", at: at3 }));
        const t1 = along(x, q), t2 = along(y, q);
        cutAt(x, node, t1!);
        cutAt(y, node, t2!);
      });
    }
    // the pieces between neighbouring nodes along each curve
    const pieces: Piece[] = [];
    for (const cu of curves) {
      const list = [...(cuts.get(cu.ref) ?? [])].map(([ref, t]) => ({ ref, t })).sort((u, v) => u.t - v.t);
      if (cu.k === "circle") {
        if (list.length < 2) continue;
        list.forEach((e, i) => { const nx = list[(i + 1) % list.length]!; pieces.push({ curve: cu, from: e.ref, to: nx.ref, ref: mkRef(`d/arc@${cu.ref.slice(2)}@${e.ref.slice(2)}@${nx.ref.slice(2)}`), arc: true, ccw: true, whole: false }); });
        continue;
      }
      for (let i = 0; i + 1 < list.length; i++) {
        const [e, nx] = [list[i]!, list[i + 1]!];
        const whole = list.length === 2 && e.ref === cu.a && nx.ref === cu.b;
        const arc = cu.k === "arc";
        pieces.push({ curve: cu, from: e.ref, to: nx.ref, ref: whole ? cu.ref : mkRef(`d/${arc ? "arc" : "seg"}@${cu.ref.slice(2)}@${e.ref.slice(2)}@${nx.ref.slice(2)}`), arc, ccw: cu.k === "arc" ? cu.sweep > 0 : true, whole });
      }
    }
    // two curves drawn one over the other make the same piece twice: one of them is enough
    const seenPiece = new Set<string>();
    const unique = pieces.filter((p) => {
      const cu = p.curve;
      const [x, y] = p.from < p.to ? [p.from, p.to] : [p.to, p.from];
      const shape = cu.k === "seg" ? "s" : `a${cu.c[0].toFixed(3)},${cu.c[1].toFixed(3)},${cu.r.toFixed(3)},${(p.from < p.to) === p.ccw ? "+" : "-"}`; // (an arc is the same arc if it has the same circle and runs the same way between the same two points)
      const key = `${x}|${y}|${shape}`;
      if (seenPiece.has(key)) return false;
      seenPiece.add(key);
      return true;
    });
    // a piece that leads nowhere cuts nothing: take away the pieces with an end that nothing else touches
    let live = unique.filter((p) => p.from !== p.to);
    for (let changed = true; changed;) {
      const deg = new Map<Ref, number>();
      for (const p of live) for (const r of [p.from, p.to]) deg.set(r, (deg.get(r) ?? 0) + 1);
      const keep = live.filter((p) => (deg.get(p.from) ?? 0) >= 2 && (deg.get(p.to) ?? 0) >= 2);
      changed = keep.length !== live.length;
      live = keep;
    }
    // separate closed shapes with nothing crossing them are left to the plain way (a loop of lines, a disk)
    const deg = new Map<Ref, number>();
    for (const p of live) for (const r of [p.from, p.to]) deg.set(r, (deg.get(r) ?? 0) + 1);
    const comp = new Map<Ref, Ref>();
    const root = (r: Ref): Ref => { let x = r; while (comp.get(x) && comp.get(x) !== x) x = comp.get(x)!; return x; };
    for (const p of live) { for (const r of [p.from, p.to]) if (!comp.has(r)) comp.set(r, r); comp.set(root(p.from), root(p.to)); }
    const complex = new Set<Ref>();
    for (const p of live) if (!p.whole || p.curve.k === "circle" || (deg.get(p.from) ?? 0) > 2 || (deg.get(p.to) ?? 0) > 2) complex.add(root(p.from));
    live = live.filter((p) => complex.has(root(p.from)));
    if (!live.length) continue;
    // the parts that stand for the nodes and the pieces
    const nodeMap = new Map(nodes.map((m) => [m.ref, m]));
    const made = new Map<Ref, Part>();
    for (const p of live) {
      for (const r of [p.from, p.to]) { const nd = nodeMap.get(r); if (nd?.part) made.set(nd.ref, nd.part); }
      if (!p.whole) {
        const cu = p.curve;
        made.set(p.ref, { origin: "drawn", movable: false, plane: plRef, derived: true, ref: p.ref, kind: "line", a: p.from, b: p.to, ...(cu.k !== "seg" ? { center: cu.centre, ccw: p.ccw } : {}) } as Line);
      }
      res.taken.add(p.curve.ref);
    }
    const look: Lookup = (r) => made.get(r) ?? s.parts[r];
    // the faces: walk round the pieces keeping the face on the left
    const halves: Half[] = [];
    for (const p of live) {
      const [a, b] = [nodeMap.get(p.from)!.at, nodeMap.get(p.to)!.at];
      const cu = p.curve;
      const arcDir = (at: V2, forward: boolean) => ang((cu as Exclude<Curve, { k: "seg" }>).c, at) + (p.ccw === forward ? Math.PI / 2 : -Math.PI / 2);
      const out = p.arc ? arcDir(a, true) : Math.atan2(b[1] - a[1], b[0] - a[0]);
      const back = p.arc ? arcDir(b, false) : Math.atan2(a[1] - b[1], a[0] - b[0]);
      const i = halves.length;
      halves.push({ from: p.from, to: p.to, piece: p, dir: out, twin: i + 1 }, { from: p.to, to: p.from, piece: p, dir: back, twin: i });
    }
    const around = new Map<Ref, number[]>();
    halves.forEach((h, i) => around.set(h.from, [...(around.get(h.from) ?? []), i]));
    for (const l of around.values()) l.sort((u, v) => mod(halves[u]!.dir) - mod(halves[v]!.dir));
    const next = (i: number): number => {
      const l = around.get(halves[i]!.to)!;
      return l[(l.indexOf(halves[i]!.twin) - 1 + l.length) % l.length]!; // the first one clockwise from the way back: the face stays on its left
    };
    const seen = new Set<number>();
    for (let i = 0; i < halves.length; i++) {
      if (seen.has(i)) continue;
      const cycle: number[] = [];
      for (let j = i; !seen.has(j); j = next(j)) { seen.add(j); cycle.push(j); }
      if (cycle.length < 2 || next(cycle[cycle.length - 1]!) !== cycle[0]) continue;
      const loop = cycle.map((j) => halves[j]!.piece.ref);
      const corners = cycle.map((j) => halves[j]!.from);
      if (new Set(loop).size !== loop.length) continue;
      const poly = loopPoints(look, loop, corners).map(flat);
      const area = poly.reduce((acc, p, k) => acc + (p[0] * poly[(k + 1) % poly.length]![1] - poly[(k + 1) % poly.length]![0] * p[1]), 0) / 2;
      if (!(area > 1e-9)) continue; // (the outside of a figure turns the other way round)
      res.faces.push({ origin: "drawn", movable: true, ref: mkRef(`d/loop@${[...loop].map((r) => r.slice(2)).sort().join("+")}`), kind: "face", plane: plRef, loop, corners, pieces: true });
    }
    res.parts.push(...made.values());
  }
  return res;
}
