// Closed shapes from drawn lines: a loop of lines is a face (a sketch is not a thing; this is how a closed shape gets its face, `dec_clean_engine_design` section 2).
import type { Ref } from "../shared/ref.ts";
import { ref as mkRef } from "../shared/ref.ts";
import type { Lookup, Face, Part, Line } from "./part.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot } from "../math/vec.ts";
import { circleOf, loopPoints, inPolygon, pointOf, normalOfPlane } from "./part.ts";
import type { Scene } from "./scene.ts";
import { regionsOf } from "./regions.ts";

/** Order the lines into one closed loop of corners, or say why not. */
export function loopOf(get: Lookup, lines: readonly Ref[]): { ok: true; corners: Ref[] } | { ok: false; error: string } {
  const segs = lines.map((r) => get(r)).filter((p): p is Extract<NonNullable<ReturnType<Lookup>>, { kind: "line" }> => p?.kind === "line");
  if (!segs.length || segs.length !== lines.length) return { ok: false, error: "select lines to extrude" };
  // the sides at each corner, in the order of the lines: the next side is the first not walked yet that has the corner (as a search through all the sides for each corner was, a gear's four hundred made it the square of that)
  const at = new Map<Ref, number[]>();
  segs.forEach((sg, i) => { for (const c of sg.a === sg.b ? [sg.a] : [sg.a, sg.b]) { const list = at.get(c); if (list) list.push(i); else at.set(c, [i]); } });
  const used = new Set<number>();
  const corners: Ref[] = [segs[0]!.a];
  let cur = segs[0]!.b;
  used.add(0);
  while (cur !== corners[0]) {
    corners.push(cur);
    const next = (at.get(cur) ?? []).find((i) => !used.has(i)) ?? -1;
    if (next < 0) return { ok: false, error: "the lines do not make a closed shape" };
    used.add(next);
    cur = segs[next]!.a === cur ? segs[next]!.b : segs[next]!.a;
  }
  return used.size === segs.length ? { ok: true, corners } : { ok: false, error: "the lines make more than one shape" };
}


/** The names a derived face gets (so a tool can select the figure it just drew). */
export const loopFaceRef = (lines: readonly Ref[]): Ref => mkRef(`d/loop@${[...lines].sort()[0]!.slice(2)}`);
export const diskFaceRef = (circle: Ref): Ref => mkRef(`d/disk@${circle.slice(2)}`);

type DrawnLine = Extract<Part, { kind: "line" }>;
const groupsKept = new Map<Ref, { ls: readonly DrawnLine[]; groups: DrawnLine[][] }>();
/**
 * The connected groups of the lines on a plane (by shared corners), kept while the lines are the same objects in the same order (`in_784`): a change that leaves the lines of a plane as they are (a corner moved, a bubble, a body drawn
 * again) found its groups again by walking every line of every gear; the lines at each corner are known, so a line's neighbours are not looked for among all the lines.
 */
function groupsOf(plane: Ref, ls: readonly DrawnLine[]): DrawnLine[][] {
  const kept = groupsKept.get(plane);
  if (kept && kept.ls.length === ls.length && kept.ls.every((l, i) => l === ls[i])) return kept.groups;
  const groups: DrawnLine[][] = [];
  const at = new Map<Ref, number[]>();
  ls.forEach((l, i) => { for (const c of l.a === l.b ? [l.a] : [l.a, l.b]) { const list = at.get(c); if (list) list.push(i); else at.set(c, [i]); } });
  const left = new Set(ls.map((l) => l.ref));
  let from = 0;
  while (left.size) {
    const group: DrawnLine[] = [];
    while (!left.has(ls[from]!.ref)) from++;
    const first = ls[from]!;
    const queue = [first];
    left.delete(first.ref);
    while (queue.length) {
      const cur = queue.pop()!;
      group.push(cur);
      const near = [...new Set([...(at.get(cur.a) ?? []), ...(at.get(cur.b) ?? [])])].sort((x, y) => x - y); // (in the order of the lines, as before)
      for (const i of near) { const o = ls[i]!; if (left.has(o.ref)) (left.delete(o.ref), queue.push(o)); }
    }
    groups.push(group);
  }
  if (groupsKept.size > 32) groupsKept.clear();
  groupsKept.set(plane, { ls: [...ls], groups });
  return groups;
}

/** The faces of a scene's drawn lines and circles: each closed loop of lines on a plane, and each circle as a disk. Derived: not saved, rebuilt after any change. */
export function derivedFaces(s: Scene): { faces: Face[]; parts: Part[] } {
  const cut = regionsOf(s);
  const madeMap = new Map(cut.parts.map((a) => [a.ref, a]));
  const get: Lookup = (r) => madeMap.get(r) ?? s.parts[r];
  const lines = Object.values(s.parts).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "drawn" && !!p.plane && !cut.taken.has(p.ref));
  const byPlane = new Map<Ref, typeof lines>();
  for (const l of lines) { const list = byPlane.get(l.plane!); if (list) list.push(l); else byPlane.set(l.plane!, [l]); }
  const out: Face[] = [];
  const base = { origin: "drawn" as const, movable: true };
  for (const [plane, ls] of byPlane) {
    for (const group of groupsOf(plane, ls)) {
      const loop = loopOf(get, group.map((l) => l.ref));
      if (!loop.ok || (group.length < 3 && !group.some((l) => l.bulge || l.center || l.spline))) continue; // (an arc and its chord are a shape of two lines)
      out.push({ ...base, ref: loopFaceRef(group.map((l) => l.ref)), kind: "face", plane, loop: group.map((l) => l.ref), corners: loop.corners });
    }
  }
  for (const p of Object.values(s.parts)) {
    if (p.kind === "circle" && p.origin === "drawn" && p.plane && !cut.taken.has(p.ref)) out.push({ ...base, ref: diskFaceRef(p.ref), kind: "face", plane: p.plane, loop: [], corners: [p.center], disk: p.ref });
  }
  return { faces: withHoles(get, [...out, ...cut.faces]), parts: cut.parts };
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
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    return { poly, area, plane: f.plane, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number] };
  });
  const inside = (b: number, a: number) => shapes[a] && shapes[b] && shapes[a]!.plane === shapes[b]!.plane && shapes[b]!.area < shapes[a]!.area - 1e-9 && shapes[b]!.box[0] >= shapes[a]!.box[0] - 1e-9 && shapes[b]!.box[1] >= shapes[a]!.box[1] - 1e-9 && shapes[b]!.box[2] <= shapes[a]!.box[2] + 1e-9 && shapes[b]!.box[3] <= shapes[a]!.box[3] + 1e-9 && shapes[b]!.poly.every((p) => inPolygon(p, shapes[a]!.poly));
  return faces.map((f, a) => {
    const within = faces.map((_, b) => b).filter((b) => b !== a && inside(b, a));
    const direct = within.filter((b) => !within.some((c) => c !== b && inside(b, c)));
    return direct.length ? { ...f, holes: direct.map((b) => faces[b]!.ref) } : f;
  });
}
