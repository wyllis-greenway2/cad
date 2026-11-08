// Offset of the edges of the body (`in_199`): the edges of a flat face (or a face selected whole) are copied as a sketch on that face, moved in (or out) by a distance. The edges can be straight and circular
// (an arc of a rim): the copy of a straight edge is a parallel line, of an arc an arc about the same centre with its radius made smaller or larger, and where two meet the new ends are where the new edges meet.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import { formatId, drawnRef } from "../shared/ref.ts";
import type { Command } from "../operation/commands.ts";
import type { Part, Plane, Line } from "../operation/part.ts";
import { pointOf, normalOfPlane } from "../operation/part.ts";
import { planeForDrawing } from "./tools.ts";

type V2 = [number, number];
export type Edge2 =
  | { k: "seg"; p: V2; q: V2 }
  | { k: "arc"; c: V2; r: number; p: V2; q: V2; ccw: boolean };
export interface Outline { kind: "outline"; plane: Ref; edges: Edge2[]; closed: boolean; /** +1: the inside of the face is to the left of the way the chain runs, -1: to the right */ side: 1 | -1; origin: Vec3; normal: Vec3 }

const local = (pl: Plane, p: Vec3): V2 => [dot(sub(p, pl.at), pl.u), dot(sub(p, pl.at), pl.v)];
const lift = (pl: Plane, q: V2): Vec3 => add(pl.at, add(scale(pl.u, q[0]), scale(pl.v, q[1])));
const near2 = (a: V2, b: V2, t = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) < t;
const norm2 = (v: V2): V2 => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

/** The edges of a flat face of the body: the lines that lie on the boundary of its triangles. */
export function faceEdges(scene: Scene, face: Extract<Part, { kind: "plane" }>): Ref[] {
  const m = face.mesh;
  if (!m) return [];
  const key = (i: number) => `${Math.round(m[i]! * 1e3)},${Math.round(m[i + 1]! * 1e3)},${Math.round(m[i + 2]! * 1e3)}`;
  const count = new Map<string, { a: Vec3; b: Vec3; n: number }>();
  for (let i = 0; i + 8 < m.length; i += 9) {
    for (const [x, y] of [[0, 3], [3, 6], [6, 0]] as const) {
      const [ka, kb] = [key(i + x), key(i + y)];
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = count.get(k) ?? { a: [m[i + x]!, m[i + x + 1]!, m[i + x + 2]!] as Vec3, b: [m[i + y]!, m[i + y + 1]!, m[i + y + 2]!] as Vec3, n: 0 };
      e.n++;
      count.set(k, e);
    }
  }
  const boundary = [...count.values()].filter((e) => e.n === 1);
  const onBoundary = (p: Vec3, tol = 2e-3): boolean => boundary.some((e) => { const d = sub(e.b, e.a); const l2 = dot(d, d) || 1; const t = Math.min(1, Math.max(0, dot(sub(p, e.a), d) / l2)); const q = add(e.a, scale(d, t)); return Math.hypot(...sub(p, q)) < tol; });
  return Object.values(scene.parts).filter((l): l is Line => l.kind === "line" && l.origin === "body" && !!onBoundaryEdge(scene, l, onBoundary)).map((l) => l.ref);
}
const onBoundaryEdge = (scene: Scene, l: Line, on: (p: Vec3, tol?: number) => boolean): boolean => {
  const [a, b] = [pointOf((r) => scene.parts[r], l.a), pointOf((r) => scene.parts[r], l.b)];
  if (!a || !b) return false;
  return on(a) && on(b) && (l.mid ? on(l.mid, 0.2) /* (the triangles of a curve are chords: its middle is a little off them) */ : on([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]));
};

/** The outline a selection of body edges (or one flat face) gives, or null if it is not edges of one flat face that make one chain. */
export function bodyOutline(scene: Scene, parts: Part[], ins?: (p: V2) => boolean): Outline | null {
  const get = (r: Ref) => scene.parts[r];
  let face: Extract<Part, { kind: "plane" }> | null = null;
  let refs: Ref[];
  const only = parts.length === 1 ? parts[0]! : null;
  if (only?.kind === "plane" && only.origin === "body" && !only.curved && !only.rounded && only.mesh) { face = only; refs = faceEdges(scene, only); }
  else if (parts.length && parts.every((p) => p.kind === "line" && p.origin === "body")) refs = parts.map((p) => p.ref);
  else return null;
  const edges = refs.map((r) => get(r)).filter((l): l is Line => l?.kind === "line");
  if (!edges.length) return null;
  // the flat face they lie on (the one given, or one that holds every edge)
  const flats = Object.values(scene.parts).filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded && !!p.mesh && p.mesh.length >= 9);
  const holds = (f: Extract<Part, { kind: "plane" }>) => { const n = normalOfPlane(f); return edges.every((l) => [pointOf(get, l.a), pointOf(get, l.b), l.mid ?? null].every((p) => !p || Math.abs(dot(n, sub(p, f.at))) < 1e-3)); };
  face = face ?? flats.find(holds) ?? null;
  if (!face || !holds(face)) return null;
  const pl = face;
  // the middle of the face, to know which side is in
  const m = face.mesh!;
  let cx = 0, cy = 0, cn = 0;
  for (let i = 0; i + 2 < m.length; i += 3) { const q = local(pl, [m[i]!, m[i + 1]!, m[i + 2]!]); cx += q[0]; cy += q[1]; cn++; }
  const mid: V2 = [cx / cn, cy / cn];
  // a whole rim on its own: a circle
  if (edges.length === 1 && edges[0]!.a === edges[0]!.b && edges[0]!.circle) {
    const c = local(pl, edges[0]!.circle!.center);
    const r = edges[0]!.circle!.radius;
    const p: V2 = [c[0] + r, c[1]];
    // (a hole of a face with holes: the face's middle says nothing, a point just inside the circle is asked whether it is in the face, `in_228`)
    const within = ins ? ins([c[0] + r - 0.1 * r, c[1]]) : Math.hypot(mid[0] - c[0], mid[1] - c[1]) < r;
    return { kind: "outline", plane: pl.ref, edges: [{ k: "arc", c, r, p, q: p, ccw: true }], closed: true, side: within ? 1 : -1, origin: lift(pl, p), normal: pl.u };
  }
  if (edges.some((l) => l.a === l.b)) return null;
  // the chain: edges joined end to end at shared corners
  const at = new Map<Ref, Line[]>();
  for (const l of edges) for (const r of [l.a, l.b]) at.set(r, [...(at.get(r) ?? []), l]);
  if ([...at.values()].some((v) => v.length > 2)) return null;
  const start = [...at.entries()].find(([, v]) => v.length === 1)?.[0] ?? edges[0]!.a;
  const order: { l: Line; from: Ref }[] = [];
  const used = new Set<Ref>();
  let cur = start;
  for (let step = 0; step < edges.length; step++) {
    const l = (at.get(cur) ?? []).find((x) => !used.has(x.ref));
    if (!l) break;
    used.add(l.ref);
    order.push({ l, from: cur });
    cur = l.a === cur ? l.b : l.a;
  }
  if (order.length !== edges.length) return null; // more than one chain
  const closed = order.length > 1 && cur === start;
  const out: Edge2[] = order.map(({ l, from }): Edge2 => {
    const [pa, pb] = [pointOf(get, from), pointOf(get, l.a === from ? l.b : l.a)];
    const [p, q] = [local(pl, pa!), local(pl, pb!)];
    if (!l.mid) return { k: "seg", p, q };
    const c = local(pl, l.circle!.center);
    const mm = local(pl, l.mid);
    const ccw = (p[0] - c[0]) * (mm[1] - c[1]) - (p[1] - c[1]) * (mm[0] - c[0]) > 0;
    return { k: "arc", c, r: l.circle!.radius, p, q, ccw };
  });
  // the side the face is on: the way most of the edges have the middle of the face to their left
  let vote = 0;
  for (const e of out) {
    const mp: V2 = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2];
    const t = tangent(e, 0.5);
    const left: V2 = [-t[1], t[0]];
    vote += Math.sign((mid[0] - mp[0]) * left[0] + (mid[1] - mp[1]) * left[1]);
  }
  if (closed && out.length) { /* a closed chain: the same count says it */ }
  // a loop of a face with holes: the middle of the face says nothing about a hole's side, so a point just to the left of the first edge is asked whether it is in the face (`in_228`)
  let side: 1 | -1 = vote >= 0 ? 1 : -1;
  if (ins) {
    const e0 = out[0]!;
    const m0 = pointAt(e0, 0.5);
    const t0 = tangent(e0, 0.5);
    const depth = Math.max(1e-3, 0.02 * Math.hypot(e0.q[0] - e0.p[0], e0.q[1] - e0.p[1])); // (the triangles of a curve are chords: deep enough to be past them)
    side = ins([m0[0] - t0[1] * depth, m0[1] + t0[0] * depth]) ? 1 : -1;
  }
  const first = out[0]!;
  const fm: V2 = [(first.p[0] + first.q[0]) / 2, (first.p[1] + first.q[1]) / 2];
  const t0 = tangent(first, 0.5);
  const left: V2 = [-t0[1], t0[0]];
  const outward: V2 = [-side * left[0], -side * left[1]];
  return { kind: "outline", plane: pl.ref, edges: out, closed, side, origin: lift(pl, first.k === "seg" ? fm : first.p), normal: add(scale(pl.u, outward[0]), scale(pl.v, outward[1])) };
}

/**
 * The outline of drawn lines and arcs (`in_232`): the sides of a closed figure, or a chain of lines and arcs joined end to end, on one plane. The same outline as for the edges of a face of the body, so it is
 * offset the same way: straight sides moved parallel, arcs about their own centres with the radius made smaller or larger, and the new ends where neighbouring ones meet. A closed figure has its inside to the
 * left of the way it runs when it turns counter-clockwise; an open chain has no inside (positive is out to the right of it).
 */
export function drawnOutline(scene: Scene, lines: Line[]): Outline | null {
  const get = (r: Ref) => scene.parts[r];
  if (!lines.length || lines.some((l) => !l.plane || l.plane !== lines[0]!.plane || l.a === l.b || l.bulge)) return null;
  const pl = get(lines[0]!.plane!);
  if (!pl || pl.kind !== "plane") return null;
  const at = new Map<Ref, Line[]>();
  for (const l of lines) for (const r of [l.a, l.b]) at.set(r, [...(at.get(r) ?? []), l]);
  if ([...at.values()].some((v) => v.length > 2)) return null;
  const start = [...at.entries()].find(([, v]) => v.length === 1)?.[0] ?? lines[0]!.a;
  const order: { l: Line; from: Ref }[] = [];
  const used = new Set<Ref>();
  let cur = start;
  for (let step = 0; step < lines.length; step++) {
    const l = (at.get(cur) ?? []).find((x) => !used.has(x.ref));
    if (!l) break;
    used.add(l.ref);
    order.push({ l, from: cur });
    cur = l.a === cur ? l.b : l.a;
  }
  if (order.length !== lines.length) return null; // more than one chain
  const closed = order.length > 1 && cur === start;
  const edges: Edge2[] = [];
  for (const { l, from } of order) {
    const [pa, pb] = [pointOf(get, from), pointOf(get, l.a === from ? l.b : l.a)];
    if (!pa || !pb) return null;
    const [p, q] = [local(pl, pa), local(pl, pb)];
    if (!l.center) { edges.push({ k: "seg", p, q }); continue; }
    const cp = pointOf(get, l.center);
    if (!cp) return null;
    const c = local(pl, cp);
    edges.push({ k: "arc", c, r: Math.hypot(p[0] - c[0], p[1] - c[1]), p, q, ccw: from === l.a ? l.ccw !== false : l.ccw === false });
  }
  // which side the inside is on: a closed figure that turns counter-clockwise has it to the left
  let side: 1 | -1 = 1;
  if (closed) {
    const poly: V2[] = edges.flatMap((e) => Array.from({ length: e.k === "arc" ? 32 : 1 }, (_, i) => pointAt(e, i / (e.k === "arc" ? 32 : 1))));
    const area = poly.reduce((sum, a, i) => { const b = poly[(i + 1) % poly.length]!; return sum + (a[0] * b[1] - b[0] * a[1]); }, 0);
    side = area >= 0 ? 1 : -1;
  } else side = 1; // (an open chain: out is to its right, as the arrow of a line points)
  const first = edges[0]!;
  const fm: V2 = [(first.p[0] + first.q[0]) / 2, (first.p[1] + first.q[1]) / 2];
  const t0 = tangent(first, 0.5);
  const left: V2 = [-t0[1], t0[0]];
  const outward: V2 = [-side * left[0], -side * left[1]];
  const ori = first.k === "seg" ? fm : pointAt(first, 0.5);
  return { kind: "outline", plane: pl.ref, edges, closed, side, origin: lift(pl, ori), normal: add(scale(pl.u, outward[0]), scale(pl.v, outward[1])) };
}

/** The direction an edge runs in at a fraction of the way along (0 the start, 1 the end). */
function tangent(e: Edge2, t: number): V2 {
  if (e.k === "seg") return norm2([e.q[0] - e.p[0], e.q[1] - e.p[1]]);
  const a0 = Math.atan2(e.p[1] - e.c[1], e.p[0] - e.c[0]);
  const a1 = Math.atan2(e.q[1] - e.c[1], e.q[0] - e.c[0]);
  let sweep = e.ccw ? (a1 - a0 + 4 * Math.PI) % (2 * Math.PI) : -((a0 - a1 + 4 * Math.PI) % (2 * Math.PI));
  if (Math.abs(sweep) < 1e-9) sweep = e.ccw ? 2 * Math.PI : -2 * Math.PI;
  const a = a0 + sweep * t;
  return e.ccw ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)];
}
/** The point at a fraction of the way along an edge. */
function pointAt(e: Edge2, t: number): V2 {
  if (e.k === "seg") return [e.p[0] + (e.q[0] - e.p[0]) * t, e.p[1] + (e.q[1] - e.p[1]) * t];
  const a0 = Math.atan2(e.p[1] - e.c[1], e.p[0] - e.c[0]);
  const a1 = Math.atan2(e.q[1] - e.c[1], e.q[0] - e.c[0]);
  let sweep = e.ccw ? (a1 - a0 + 4 * Math.PI) % (2 * Math.PI) : -((a0 - a1 + 4 * Math.PI) % (2 * Math.PI));
  if (Math.abs(sweep) < 1e-9) sweep = e.ccw ? 2 * Math.PI : -2 * Math.PI;
  const a = a0 + sweep * t;
  return [e.c[0] + Math.cos(a) * e.r, e.c[1] + Math.sin(a) * e.r];
}

/** A moved copy of an edge: straight, shifted; an arc, with the radius changed by `d` (towards the inside of the face, `inward` positive) when its centre is on the inside, the other way when it is not. */
function moved(e: Edge2, inward: number, side: 1 | -1): { edge: Edge2; line: { p: V2; d: V2 } | null; circle: { c: V2; r: number } | null } {
  const t = tangent(e, 0.5);
  const nIn: V2 = [-side * t[1], side * t[0]];
  if (e.k === "seg") {
    const [p, q]: [V2, V2] = [[e.p[0] + nIn[0] * inward, e.p[1] + nIn[1] * inward], [e.q[0] + nIn[0] * inward, e.q[1] + nIn[1] * inward]];
    return { edge: { k: "seg", p, q }, line: { p, d: t }, circle: null };
  }
  const mp = pointAt(e, 0.5);
  const centreIn = (e.c[0] - mp[0]) * nIn[0] + (e.c[1] - mp[1]) * nIn[1] > 0;
  const r = e.r + (centreIn ? -inward : inward);
  return { edge: { ...e, r }, line: null, circle: { c: e.c, r } };
}

/** The points where two moved edges meet (their lines or circles), nearest to `guess`. */
function meetAt(a: ReturnType<typeof moved>, b: ReturnType<typeof moved>, guess: V2): V2 | null {
  const pts: V2[] = [];
  if (a.line && b.line) {
    const cr = a.line.d[0] * b.line.d[1] - a.line.d[1] * b.line.d[0];
    if (Math.abs(cr) < 1e-9) return null;
    const t = ((b.line.p[0] - a.line.p[0]) * b.line.d[1] - (b.line.p[1] - a.line.p[1]) * b.line.d[0]) / cr;
    pts.push([a.line.p[0] + a.line.d[0] * t, a.line.p[1] + a.line.d[1] * t]);
  } else if (a.line || b.line) {
    const l = (a.line ?? b.line)!;
    const c = (a.circle ?? b.circle)!;
    const f: V2 = [l.p[0] - c.c[0], l.p[1] - c.c[1]];
    const B = 2 * (f[0] * l.d[0] + f[1] * l.d[1]);
    const C = f[0] * f[0] + f[1] * f[1] - c.r * c.r;
    const disc = B * B - 4 * C;
    if (disc >= -1e-9) for (const s of [-1, 1]) { const t = (-B + s * Math.sqrt(Math.max(0, disc))) / 2; pts.push([l.p[0] + l.d[0] * t, l.p[1] + l.d[1] * t]); }
  } else if (a.circle && b.circle) {
    const [x, y] = [a.circle, b.circle];
    const D = Math.hypot(y.c[0] - x.c[0], y.c[1] - x.c[1]);
    if (D > 1e-9 && D <= x.r + y.r + 1e-9 && D >= Math.abs(x.r - y.r) - 1e-9) {
      const l = (x.r * x.r - y.r * y.r + D * D) / (2 * D);
      const h = Math.sqrt(Math.max(0, x.r * x.r - l * l));
      const m: V2 = [x.c[0] + ((y.c[0] - x.c[0]) * l) / D, x.c[1] + ((y.c[1] - x.c[1]) * l) / D];
      const n: V2 = [-(y.c[1] - x.c[1]) / D, (y.c[0] - x.c[0]) / D];
      pts.push([m[0] + n[0] * h, m[1] + n[1] * h], [m[0] - n[0] * h, m[1] - n[1] * h]);
    }
  }
  if (!pts.length) return null;
  return pts.sort((u, v) => Math.hypot(u[0] - guess[0], u[1] - guess[1]) - Math.hypot(v[0] - guess[0], v[1] - guess[1]))[0]!;
}

/** The command that draws the outline moved `v` out (negative: in) as a sketch on the face, or null when it cannot be (an arc that has gone to nothing, edges that turn round). */
export function outlineCommand(scene: Scene, src: Outline, v: number): Command | null {
  const pl = scene.parts[src.plane];
  if (!pl || pl.kind !== "plane" || Math.abs(v) < 1e-9) return null;
  const inward = -v;
  const n = src.edges.length;
  // a whole rim on its own: a concentric circle
  if (n === 1 && src.closed && src.edges[0]!.k === "arc" && near2(src.edges[0]!.p, src.edges[0]!.q)) {
    const e = src.edges[0]!;
    const r = e.r + (src.side === 1 ? -inward : inward);
    if (!(r > 1e-6)) return null;
    const draw = planeForDrawing(scene, src.plane);
    const id = nextId(scene, "e");
    const [cRef, kRef] = [drawnRef(`${id}.c`), drawnRef(`${id}.k`)];
    const base = { origin: "drawn" as const, plane: draw.plane, movable: true };
    return { type: "batch", commands: [...(draw.command ? [draw.command] : []), { type: "addPart", part: { ...base, ref: cRef, kind: "corner", at: lift(pl, e.c) } }, { type: "addPart", part: { ...base, ref: kRef, kind: "circle", center: cRef, radius: r } }] };
  }
  const mv = src.edges.map((e) => moved(e, inward, src.side));
  if (mv.some((m) => m.edge.k === "arc" && !(m.edge.r > 1e-6))) return null;
  // the new ends: where neighbouring moved edges meet; an end that is only an edge's own (the ends of an open chain, and edges that run on tangentially) is the old one moved along the inward normal there
  const joints: V2[] = [];
  const count = src.closed ? n : n + 1;
  for (let k = 0; k < count; k++) {
    const [ia, ib] = [(k + n - 1) % n, k % n];
    const open = !src.closed && (k === 0 || k === n);
    if (open) {
      const e = k === 0 ? src.edges[0]! : src.edges[n - 1]!;
      const tt = tangent(e, k === 0 ? 0 : 1);
      const nIn: V2 = [-src.side * tt[1], src.side * tt[0]];
      const point = k === 0 ? e.p : e.q;
      const m = mv[k === 0 ? 0 : n - 1]!;
      // an arc's end moves along its radius, a straight edge's along its normal
      if (m.edge.k === "arc") { const c = m.edge.c; const u = norm2([point[0] - c[0], point[1] - c[1]]); joints.push([c[0] + u[0] * m.edge.r, c[1] + u[1] * m.edge.r]); }
      else joints.push([point[0] + nIn[0] * inward, point[1] + nIn[1] * inward]);
      continue;
    }
    const [ea, eb] = [src.edges[ia]!, src.edges[ib]!];
    const [ta, tb] = [tangent(ea, 1), tangent(eb, 0)];
    const joint = ea.q;
    const nIn: V2 = [-src.side * ta[1], src.side * ta[0]];
    const continuous = Math.abs(ta[0] * tb[1] - ta[1] * tb[0]) < 2e-3 // (the body gives its points to four places: edges that run on tangentially differ by a hair)
       && ta[0] * tb[0] + ta[1] * tb[1] > 0;
    if (continuous) { joints.push([joint[0] + nIn[0] * inward, joint[1] + nIn[1] * inward]); continue; }
    const guess: V2 = [joint[0] + nIn[0] * inward, joint[1] + nIn[1] * inward];
    const hit = meetAt(mv[ia]!, mv[ib]!, guess);
    if (!hit) return null;
    joints.push(hit);
  }
  // each moved edge must still run the way it did (an edge squeezed out by the move turns round)
  for (let i = 0; i < n; i++) {
    const [a, b] = [joints[i]!, joints[(i + 1) % joints.length]!];
    const e = src.edges[i]!;
    const t = tangent(e, 0.5);
    if (e.k === "seg" && (b[0] - a[0]) * t[0] + (b[1] - a[1]) * t[1] <= 1e-9) return null;
  }
  const draw = planeForDrawing(scene, src.plane);
  const id = nextId(scene, "e");
  const base = { origin: "drawn" as const, plane: draw.plane, movable: true };
  const commands: Command[] = draw.command ? [draw.command] : [];
  const corners = joints.map((_, i) => drawnRef(`${id}.p${i}`));
  joints.forEach((j, i) => commands.push({ type: "addPart", part: { ...base, ref: corners[i]!, kind: "corner", at: lift(pl, j) } }));
  let rid = scene.counter;
  src.edges.forEach((e, i) => {
    const [a, b] = [corners[i]!, corners[(i + 1) % corners.length]!];
    const line = drawnRef(`${id}.s${i}`);
    if (e.k === "seg") { commands.push({ type: "addPart", part: { ...base, ref: line, kind: "line", a, b } }); return; }
    const centre = drawnRef(`${id}.c${i}`);
    const m = mv[i]!.edge as Extract<Edge2, { k: "arc" }>;
    commands.push({ type: "addPart", part: { ...base, ref: centre, kind: "corner", at: lift(pl, m.c) } });
    commands.push({ type: "addPart", part: { ...base, ref: line, kind: "line", a, b, center: centre, ccw: e.ccw } });
    commands.push({ type: "addRelation", relation: { id: formatId("r", ++rid), kind: "arcEnds", parts: [line, centre] } });
  });
  return { type: "batch", commands };
}

/** The outlines of every loop of a flat face of the body, outer and holes, each with the side the material is on, so offsetting the face moves all of them (`in_228`). Null unless the selection is one flat face with more than one loop. */
export function bodyOutlines(scene: Scene, parts: Part[]): { loops: Outline[] } | null {
  const only = parts.length === 1 ? parts[0]! : null;
  if (only?.kind !== "plane" || only.origin !== "body" || only.curved || only.rounded || !only.mesh) return null;
  const refs = faceEdges(scene, only);
  const lines = refs.map((r) => scene.parts[r]).filter((l): l is Line => l?.kind === "line");
  // the loops: edges joined at shared corners
  const parent: number[] = lines.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const at = new Map<Ref, number>();
  lines.forEach((l, i) => { for (const c of [l.a, l.b]) { const j = at.get(c); if (j === undefined) at.set(c, i); else parent[find(i)] = find(j); } });
  const groups = new Map<number, Line[]>();
  lines.forEach((l, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), l]));
  if (groups.size < 2) return null;
  const pl = only;
  const tris: [V2, V2, V2][] = [];
  const m = only.mesh;
  for (let i = 0; i + 8 < m.length; i += 9) tris.push([local(pl, [m[i]!, m[i + 1]!, m[i + 2]!]), local(pl, [m[i + 3]!, m[i + 4]!, m[i + 5]!]), local(pl, [m[i + 6]!, m[i + 7]!, m[i + 8]!])]);
  const inside = (p: V2): boolean => tris.some(([a, b, c]) => { const d = (u: V2, v: V2, w: V2) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]); const [d1, d2, d3] = [d(p, a, b), d(p, b, c), d(p, c, a)]; return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); });
  const loops: Outline[] = [];
  for (const g of groups.values()) { const o = bodyOutline(scene, g, inside); if (!o) return null; loops.push(o); }
  return { loops };
}
