// Closed shapes from drawn lines: a loop of lines is a face (a sketch is not a thing; this is how a closed shape gets its face, `dec_clean_engine_design` section 2).
import type { Ref } from "../shared/ref.ts";
import { ref as mkRef } from "../shared/ref.ts";
import type { Lookup, Face, Part, Line } from "./part.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot } from "../math/vec.ts";
import { circleOf, loopPoints, inPolygon, pointOf, normalOfPlane } from "./part.ts";
import type { Scene } from "./scene.ts";

/** Order the lines into one closed loop of corners, or say why not. */
export function loopOf(get: Lookup, lines: readonly Ref[]): { ok: true; corners: Ref[] } | { ok: false; error: string } {
  const segs = lines.map((r) => get(r)).filter((p): p is Extract<NonNullable<ReturnType<Lookup>>, { kind: "line" }> => p?.kind === "line");
  if (!segs.length || segs.length !== lines.length) return { ok: false, error: "select lines to extrude" };
  const used = new Set<number>();
  const corners: Ref[] = [segs[0]!.a];
  let cur = segs[0]!.b;
  used.add(0);
  while (cur !== corners[0]) {
    corners.push(cur);
    const next = segs.findIndex((s, i) => !used.has(i) && (s.a === cur || s.b === cur));
    if (next < 0) return { ok: false, error: "the lines do not make a closed shape" };
    used.add(next);
    cur = segs[next]!.a === cur ? segs[next]!.b : segs[next]!.a;
  }
  return used.size === segs.length ? { ok: true, corners } : { ok: false, error: "the lines make more than one shape" };
}


/** The names a derived face gets (so a tool can select the figure it just drew). */
export const loopFaceRef = (lines: readonly Ref[]): Ref => mkRef(`d/loop@${[...lines].sort()[0]!.slice(2)}`);
export const diskFaceRef = (circle: Ref): Ref => mkRef(`d/disk@${circle.slice(2)}`);

/** The faces of a scene's drawn lines and circles: each closed loop of lines on a plane, and each circle as a disk. Derived: not saved, rebuilt after any change. */
export function derivedFaces(s: Scene): { faces: Face[]; arcs: Line[] } {
  const cut = cutCircles(s);
  const arcMap = new Map(cut.arcs.map((a) => [a.ref, a]));
  const get: Lookup = (r) => arcMap.get(r) ?? s.parts[r];
  const lines = Object.values(s.parts).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "drawn" && !!p.plane && !cut.lines.has(p.ref));
  const byPlane = new Map<Ref, typeof lines>();
  for (const l of lines) byPlane.set(l.plane!, [...(byPlane.get(l.plane!) ?? []), l]);
  const out: Face[] = [];
  const base = { origin: "drawn" as const, movable: true };
  for (const [plane, ls] of byPlane) {
    // connected groups of lines (by shared corners)
    const left = new Set(ls.map((l) => l.ref));
    while (left.size) {
      const group: typeof lines = [];
      const first = ls.find((l) => left.has(l.ref))!;
      const queue = [first];
      left.delete(first.ref);
      while (queue.length) {
        const cur = queue.pop()!;
        group.push(cur);
        for (const o of ls) if (left.has(o.ref) && (o.a === cur.a || o.a === cur.b || o.b === cur.a || o.b === cur.b)) (left.delete(o.ref), queue.push(o));
      }
      const loop = loopOf(get, group.map((l) => l.ref));
      if (!loop.ok || (group.length < 3 && !group.some((l) => l.bulge || l.center))) continue; // (an arc and its chord are a shape of two lines)
      out.push({ ...base, ref: loopFaceRef(group.map((l) => l.ref)), kind: "face", plane, loop: group.map((l) => l.ref), corners: loop.corners });
    }
  }
  for (const p of Object.values(s.parts)) {
    if (p.kind === "circle" && p.origin === "drawn" && p.plane && !cut.circles.has(p.ref)) out.push({ ...base, ref: diskFaceRef(p.ref), kind: "face", plane: p.plane, loop: [], corners: [p.center], disk: p.ref });
  }
  return { faces: withHoles(get, [...out, ...cut.faces]), arcs: cut.arcs };
}

type V2 = [number, number];

/**
 * Lines drawn across a circle cut it into pieces (a radius and another radius, a chord): each piece is a face of its own, and the circle is no longer one disk. The pieces are found
 * as the faces of the drawing made of the lines and of the arcs of the circle between the points where they meet it. Only lines whose ends are both on the circle or at its centre take part.
 * The arcs are parts (derived, counter-clockwise) so that the faces are loops of parts like any other, and an extrude can name them.
 */
function cutCircles(s: Scene): { faces: Face[]; arcs: Line[]; lines: Set<Ref>; circles: Set<Ref> } {
  const res = { faces: [] as Face[], arcs: [] as Line[], lines: new Set<Ref>(), circles: new Set<Ref>() };
  const get: Lookup = (r) => s.parts[r];
  for (const c of Object.values(s.parts)) {
    if (c.kind !== "circle" || c.origin !== "drawn" || !c.plane) continue;
    const pl = get(c.plane);
    const ci = circleOf(get, c.ref);
    if (!pl || pl.kind !== "plane" || !ci) continue;
    const flat = (q: Vec3): V2 => [dot(sub(q, pl.at), pl.u), dot(sub(q, pl.at), pl.v)];
    const mid = flat(ci.center);
    const tol = 1e-4 * Math.max(1, ci.radius);
    const onCircle = (q: V2) => Math.abs(Math.hypot(q[0] - mid[0], q[1] - mid[1]) - ci.radius) < tol;
    const atCentre = (q: V2) => Math.hypot(q[0] - mid[0], q[1] - mid[1]) < tol;
    const pos = new Map<Ref, V2>();
    const at = (r: Ref): V2 | null => { if (pos.has(r)) return pos.get(r)!; const q = pointOf(get, r); if (!q) return null; const f = flat(q); pos.set(r, f); return f; };
    // the lines across it: straight, on its plane, both ends on the circle or at its centre (not both at the centre)
    let edges = Object.values(s.parts).filter((l): l is Line => {
      if (l.kind !== "line" || l.origin !== "drawn" || l.plane !== c.plane || l.center || l.bulge || l.derived || res.lines.has(l.ref)) return false;
      const [p, q] = [at(l.a), at(l.b)];
      if (!p || !q) return false;
      const ends = [p, q];
      const onPlane = [l.a, l.b].every((r) => Math.abs(dot(sub(pointOf(get, r)!, pl.at), normalOfPlane(pl))) < 1e-6);
      return onPlane && ends.every((e) => onCircle(e) || atCentre(e)) && !(atCentre(p) && atCentre(q));
    });
    // a line that leads nowhere (its other end touches nothing else) cuts nothing
    for (let changed = true; changed;) {
      changed = false;
      const deg = new Map<Ref, number>();
      for (const e of edges) for (const r of [e.a, e.b]) deg.set(r, (deg.get(r) ?? 0) + 1);
      const keep = edges.filter((e) => [e.a, e.b].every((r) => { const q = at(r)!; return atCentre(q) ? (deg.get(r) ?? 0) >= 2 : true; }));
      if (keep.length !== edges.length) { edges = keep; changed = true; }
    }
    const rim = [...new Set(edges.flatMap((e) => [e.a, e.b]).filter((r) => onCircle(at(r)!)))].sort((a, b) => Math.atan2(at(a)![1] - mid[1], at(a)![0] - mid[0]) - Math.atan2(at(b)![1] - mid[1], at(b)![0] - mid[0]));
    if (rim.length < 2) continue;
    const angle = (r: Ref) => Math.atan2(at(r)![1] - mid[1], at(r)![0] - mid[0]);
    // the arcs between neighbouring points on the rim, counter-clockwise
    const arcs: Line[] = rim.map((a, i) => {
      const b = rim[(i + 1) % rim.length]!;
      return { origin: "drawn", plane: c.plane, movable: false, ref: mkRef(`d/arc@${c.ref.slice(2)}@${a.slice(2)}@${b.slice(2)}`), kind: "line", a, b, center: c.center, ccw: true, derived: true };
    });
    const arcMap = new Map(arcs.map((a) => [a.ref, a]));
    const look: Lookup = (r) => arcMap.get(r) ?? s.parts[r];
    // half-edges: a line both ways, an arc counter-clockwise (the way back is the outside of the circle: never a face)
    interface Half { from: Ref; to: Ref; ref: Ref; dir: number; twin: number }
    const halves: Half[] = [];
    const add2 = (e: { a: Ref; b: Ref; ref: Ref }, arc: boolean) => {
      const [p, q] = [at(e.a)!, at(e.b)!];
      const dirOut = arc ? angle(e.a) + Math.PI / 2 : Math.atan2(q[1] - p[1], q[0] - p[0]);
      const dirBack = arc ? angle(e.b) - Math.PI / 2 : Math.atan2(p[1] - q[1], p[0] - q[0]);
      const n = halves.length;
      halves.push({ from: e.a, to: e.b, ref: e.ref, dir: dirOut, twin: n + 1 }, { from: e.b, to: e.a, ref: e.ref, dir: dirBack, twin: n });
    };
    for (const e of edges) add2(e, false);
    for (const a of arcs) add2(a, true);
    const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const around = new Map<Ref, number[]>();
    halves.forEach((h, i) => around.set(h.from, [...(around.get(h.from) ?? []), i]));
    for (const l of around.values()) l.sort((x, y) => norm(halves[x]!.dir) - norm(halves[y]!.dir));
    const next = (i: number): number => {
      const h = halves[i]!;
      const l = around.get(h.to)!;
      const k = l.indexOf(h.twin);
      return l[(k - 1 + l.length) % l.length]!; // the first one clockwise from the way back: the face stays on the left
    };
    const before = res.faces.length;
    const seen = new Set<number>();
    for (let i = 0; i < halves.length; i++) {
      if (seen.has(i)) continue;
      const cycle: number[] = [];
      for (let j = i; !seen.has(j); j = next(j)) { seen.add(j); cycle.push(j); }
      if (cycle.length < 2 || next(cycle[cycle.length - 1]!) !== cycle[0]) continue;
      const loop = cycle.map((j) => halves[j]!.ref);
      const corners = cycle.map((j) => halves[j]!.from);
      // the inside of the figure has the face on its left: it turns counter-clockwise, which is a positive area
      const poly = loopPoints(look, loop, corners).map(flat);
      const area = poly.reduce((acc, p, k) => acc + (p[0] * poly[(k + 1) % poly.length]![1] - poly[(k + 1) % poly.length]![0] * p[1]), 0) / 2;
      if (!(area > 1e-9) || new Set(loop).size !== loop.length) continue;
      res.faces.push({ origin: "drawn", movable: true, ref: mkRef(`d/loop@${[...loop].map((r) => r.slice(2)).sort().join("+")}`), kind: "face", plane: c.plane, loop, corners, pieces: true });
    }
    if (res.faces.length === before) continue;
    res.arcs.push(...arcs);
    res.circles.add(c.ref);
    for (const e of edges) res.lines.add(e.ref);
  }
  return res;
}

/** Closed figures drawn inside others: each face gets, as its holes, the figures directly inside it (not those inside those), so the region between them is what is picked and extruded. */
function withHoles(get: Lookup, faces: Face[]): Face[] {
  const shapes = faces.map((f) => {
    const pl = f.plane ? get(f.plane) : undefined;
    if (!pl || pl.kind !== "plane") return null;
    const flat = (q: Vec3): [number, number] => [dot(sub(q, pl.at), pl.u), dot(sub(q, pl.at), pl.v)];
    let poly: [number, number][];
    if (f.disk) {
      const c = circleOf(get, f.disk);
      if (!c) return null;
      const [cx, cy] = flat(c.center);
      poly = Array.from({ length: 48 }, (_, i): [number, number] => [cx + Math.cos((i / 48) * Math.PI * 2) * c.radius, cy + Math.sin((i / 48) * Math.PI * 2) * c.radius]);
    } else poly = loopPoints(get, f.loop, f.corners).map(flat);
    const area = Math.abs(poly.reduce((a, p, i) => a + (poly[(i + 1) % poly.length]![0] - p[0]) * (poly[(i + 1) % poly.length]![1] + p[1]), 0)) / 2;
    return { poly, area, plane: f.plane };
  });
  const inside = (b: number, a: number) => shapes[a] && shapes[b] && shapes[a]!.plane === shapes[b]!.plane && shapes[b]!.area < shapes[a]!.area - 1e-9 && shapes[b]!.poly.every((p) => inPolygon(p, shapes[a]!.poly));
  return faces.map((f, a) => {
    const within = faces.map((_, b) => b).filter((b) => b !== a && inside(b, a));
    const direct = within.filter((b) => !within.some((c) => c !== b && inside(b, c)));
    return direct.length ? { ...f, holes: direct.map((b) => faces[b]!.ref) } : f;
  });
}
