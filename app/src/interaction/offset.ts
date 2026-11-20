// Offset (`in_177`): a copy of a drawn figure moved in or out by a distance, drawn on the same plane. A closed figure of straight sides gets a new one with every side moved and the corners where the
// neighbouring sides meet (a rectangle stays a rectangle); a circle gets a concentric one; a line, a parallel line. Positive is out of the figure (a line: to the side its arrow points), negative in.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId, lookup } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Part, Plane } from "../operation/part.ts";
import { pointOf, normalOfPlane, localOf, liftOf } from "../operation/part.ts";
import { drawChain, drawCircle } from "../operation/build.ts";
import { bodyOutline, bodyOutlines, outlineCommand, drawnOutline, outlineNear } from "./offsetbody.ts";
import type { Line } from "../operation/part.ts";
import { apply } from "../operation/commands.ts";
import type { Outline } from "./offsetbody.ts";

export type OffsetSource =
  | { kind: "loop"; plane: Ref; pts: Vec3[]; origin: Vec3; normal: Vec3 }
  | { kind: "circle"; plane: Ref; circle: Ref; centre: Vec3; radius: number; origin: Vec3; normal: Vec3 }
  | { kind: "line"; plane: Ref; a: Vec3; b: Vec3; origin: Vec3; normal: Vec3 }
  | Outline
  /** a flat face of the body with holes: every loop of it, the outer one first; they are offset together (`in_228`) */
  | { kind: "outlines"; plane: Ref; origin: Vec3; normal: Vec3; loops: Outline[] }
  /** several straight lines that are not chained (two parallel lines): each moves by the same distance to the side of its own arrow, the arrows turned to agree with the first (`in_1323`) */
  | { kind: "set"; plane: Ref; origin: Vec3; normal: Vec3; lines: { a: Vec3; b: Vec3; normal: Vec3 }[] }
  /** several enclosed sketches (closed figures, disks) on one plane: each is offset by the same distance, out of itself, and the arrow stands on the one nearest the click (`in_1374`) */
  | { kind: "group"; plane: Ref; origin: Vec3; normal: Vec3; items: OffsetSource[] };

type V2 = [number, number];
const area2 = (p: V2[]): number => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + (a[0] * b[1] - b[0] * a[1]); }, 0);

/** What a selection can be offset from: a drawn closed figure (straight sides, or with arcs), a chain of sides, one circle, one straight line, the edges or the face of a flat face of the body. */
export function offsetSource(scene: Scene, parts: Part[]): OffsetSource | null {
  const get = lookup(scene);
  const first = parts[0];
  if (parts.length && parts.every((p) => p.origin === "body")) {
    // a face with holes: all its loops, the one that reaches furthest (the outer one) first, which gives the arrow its place; else the edges of a face, or a face (`in_199`)
    const multi = bodyOutlines(scene, parts);
    if (multi) {
      const reach = (o: Outline) => Math.max(...o.edges.flatMap((e) => [Math.hypot(e.p[0], e.p[1]), Math.hypot(e.q[0], e.q[1])]));
      const loops = [...multi.loops].sort((a, b) => reach(b) - reach(a));
      return { kind: "outlines", plane: loops[0]!.plane, origin: loops[0]!.origin, normal: loops[0]!.normal, loops };
    }
    return bodyOutline(scene, parts);
  }
  // several enclosed sketches selected (each a face, perhaps with its sides and corners): each is offset, all together (`in_1374`)
  if (parts.length > 1 && parts.every((p) => p.origin === "drawn")) {
    const figs = parts.filter((p): p is Extract<Part, { kind: "face" }> => p.kind === "face");
    const mine = new Set<Ref>(figs.flatMap((f) => [f.ref, ...f.loop, ...f.corners, ...(f.disk ? [f.disk] : [])]));
    if (figs.length > 1 && parts.every((p) => mine.has(p.ref))) {
      const items = figs.map((f) => offsetSource(scene, [f]));
      if (items.every((it): it is OffsetSource => !!it && it.kind !== "group") && items.every((it) => it.plane === items[0]!.plane)) return { kind: "group", plane: items[0]!.plane, items, origin: items[0]!.origin, normal: items[0]!.normal };
    }
  }
  // what is picked of a drawn figure is often more than one part: a face is picked with its sides and corners, or a few sides, or a chain of lines and arcs. They are one outline (`in_232`)
  if (parts.length && parts.every((p) => p.origin === "drawn")) {
    const faces = parts.filter((p) => p.kind === "face");
    const face = faces.length === 1 ? (faces[0] as Extract<Part, { kind: "face" }>) : null;
    const lineRefs = face && !face.disk && face.loop.length && parts.every((p) => p === face || ((p.kind === "line" || p.kind === "corner") && p.plane === face.plane)) ? face.loop : null; // (its own sides and corners, or the whole lines the pieces were cut from)
    const chain = !faces.length ? parts.filter((p): p is Line => p.kind === "line") : [];
    const picked = lineRefs ? lineRefs.map((r) => get(r)).filter((l): l is Line => l?.kind === "line") : chain;
    const rest = !faces.length && parts.every((p) => p.kind === "line" || (p.kind === "corner" && chain.some((l) => l.a === p.ref || l.b === p.ref)));
    const curvy = picked.some((l) => l.center);
    const usable = picked.length > 0 && (lineRefs || rest) && !picked.some((l) => l.bulge || l.spline);
    if (usable && curvy) return drawnOutline(scene, picked); // arcs in it
    if (usable && !lineRefs && picked.length > 1) return drawnOutline(scene, picked) ?? separateLines(scene, picked); // a chain of straight sides picked by its sides; lines that are not one chain, each on its own
    if (usable && lineRefs && parts.length > 1) return offsetSource(scene, [face!]); // a closed figure of straight sides picked with its sides and corners: as the face alone
  }
  if (!first || parts.length !== 1 || first.origin !== "drawn") return null;
  const face = first.kind === "face" ? first : null;
  const circle = first.kind === "circle" ? first : face?.disk ? get(face.disk) : null;
  const planeRef = face?.plane ?? first.plane;
  const pl = planeRef ? get(planeRef) : undefined;
  if (!planeRef || !pl || pl.kind !== "plane") return null;
  if (circle?.kind === "circle") {
    const c = pointOf(get, circle.center);
    return c ? { kind: "circle", plane: planeRef, circle: circle.ref, centre: c, radius: circle.radius, origin: add(c, scale(pl.u, circle.radius)), normal: pl.u } : null;
  }
  if (face) {
    const lines = face.loop.map((r) => get(r));
    if (lines.some((l) => l?.kind !== "line" || l.center || l.bulge || l.spline)) return null; // straight sides only
    const pts = face.corners.map((c) => pointOf(get, c));
    if (pts.length < 3 || pts.some((p) => !p)) return null;
    const P = pts as Vec3[];
    const q = P.map((p) => localOf(pl, p));
    const a0 = q[0]!, a1 = q[1]!;
    const d: V2 = [a1[0] - a0[0], a1[1] - a0[1]];
    const len = Math.hypot(...d) || 1;
    const s = area2(q) > 0 ? 1 : -1; // counter-clockwise: out is to the right of each side
    const out: V2 = [(s * d[1]) / len, (-s * d[0]) / len];
    return { kind: "loop", plane: planeRef, pts: P, origin: liftOf(pl, [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2]), normal: add(scale(pl.u, out[0]), scale(pl.v, out[1])) };
  }
  if (first.kind === "line" && !first.center && !first.bulge && !first.spline) {
    const [a, b] = [pointOf(get, first.a), pointOf(get, first.b)];
    if (!a || !b) return null;
    const dir = normalize(sub(b, a));
    return { kind: "line", plane: planeRef, a, b, origin: scale(add(a, b), 0.5), normal: normalize(cross(normalOfPlane(pl), dir)) };
  }
  return null;
}

/** Straight lines on one plane that do not make a chain: each is offset alone, all to the same side as the first. */
function separateLines(scene: Scene, lines: Line[]): OffsetSource | null {
  const get = lookup(scene);
  if (lines.some((l) => l.center || l.bulge || l.spline || !l.plane || l.plane !== lines[0]!.plane)) return null;
  const pl = get(lines[0]!.plane!);
  if (!pl || pl.kind !== "plane") return null;
  const items: { a: Vec3; b: Vec3; normal: Vec3 }[] = [];
  for (const l of lines) {
    const [a, b] = [pointOf(get, l.a), pointOf(get, l.b)];
    if (!a || !b || dot(sub(b, a), sub(b, a)) < 1e-18) return null;
    let n = normalize(cross(normalOfPlane(pl), normalize(sub(b, a))));
    if (items.length && dot(n, items[0]!.normal) < 0) n = scale(n, -1);
    items.push({ a, b, normal: n });
  }
  const f = items[0]!;
  return { kind: "set", plane: pl.ref, lines: items, origin: scale(add(f.a, f.b), 0.5), normal: f.normal };
}

/** The command that draws the offset figure `v` out (a negative `v` is in), or null when there is none (an inward offset past the middle, a circle of no size). */
export function offsetCommand(scene: Scene, src: OffsetSource, v: number): Command | null {
  const pl = lookup(scene)(src.plane);
  if (!pl || pl.kind !== "plane" || Math.abs(v) < 1e-9) return null;
  if (src.kind === "outline") return outlineCommand(scene, src, v);
  if (src.kind === "group") {
    // each figure on the scene the ones before it left (the names do not collide); one that cannot be offset by this much (an inward offset past its middle) is left out
    let sc = scene;
    const commands: Command[] = [];
    for (const it of src.items) {
      const c = offsetCommand(sc, it, v);
      const next = c ? apply(sc, c) : null;
      if (!c || !next || !next.ok) continue;
      commands.push(c);
      sc = next.value;
    }
    return commands.length ? { type: "batch", commands } : null;
  }
  if (src.kind === "set") {
    let sc = scene;
    const commands: Command[] = [];
    for (const l of src.lines) {
      const shift = scale(l.normal, v);
      const c = drawChain(sc, src.plane, [add(l.a, shift), add(l.b, shift)]).command;
      const next = apply(sc, c);
      if (!next.ok) return null;
      commands.push(c);
      sc = next.value;
    }
    return { type: "batch", commands };
  }
  if (src.kind === "outlines") {
    // every loop, one after another (each is made on the scene the one before left, so the names do not collide)
    let sc = scene;
    const commands: Command[] = [];
    for (const loop of src.loops) {
      const c = outlineCommand(sc, loop, v);
      if (!c) return null;
      const next = apply(sc, c);
      if (!next.ok) return null;
      commands.push(c);
      sc = next.value;
    }
    return { type: "batch", commands };
  }
  if (src.kind === "circle") {
    const r = src.radius + v;
    if (!(r > 1e-6)) return null;
    const c = drawCircle(scene, src.plane, src.centre, r);
    return { type: "batch", commands: [c.command, { type: "addRelation", relation: { id: nextId(scene, "r"), kind: "concentric", parts: [c.circle, src.circle] } }] }; // (concentric with the one it came from)
  }
  if (src.kind === "line") {
    const shift = scale(src.normal, v);
    return drawChain(scene, src.plane, [add(src.a, shift), add(src.b, shift)]).command;
  }
  const q = src.pts.map((p) => localOf(pl, p));
  const s = area2(q) > 0 ? 1 : -1;
  const n = q.length;
  // the line of each side, moved out by v
  const lines = q.map((a, i): { p: V2; d: V2 } => {
    const b = q[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d: V2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return { p: [a[0] + s * d[1] * v, a[1] - s * d[0] * v], d };
  });
  const corners = q.map((_, i): V2 => {
    const [l0, l1] = [lines[(i + n - 1) % n]!, lines[i]!];
    const cr = l0.d[0] * l1.d[1] - l0.d[1] * l1.d[0];
    if (Math.abs(cr) < 1e-9) return l1.p; // two sides in one line: the corner just moves
    const t = ((l1.p[0] - l0.p[0]) * l1.d[1] - (l1.p[1] - l0.p[1]) * l1.d[0]) / cr;
    return [l0.p[0] + l0.d[0] * t, l0.p[1] + l0.d[1] * t];
  });
  const a = area2(corners);
  if (Math.abs(a) < 1e-6 || Math.sign(a) !== s) return null; // gone past the middle
  return drawChain(scene, src.plane, corners.map((c) => liftOf(pl, c)), true).command;
}

/**
 * The offset with its arrow moved to the point of the outline nearest to `p` (where the pointer was when the operation was chosen, or the middle of the view), so it is where you are looking and not on
 * the far side of a figure you are zoomed into (`in_244`). The distance is the same wherever the arrow stands; only where it is drawn, and the way out there, change.
 */
export function offsetNear(scene: Scene, src: OffsetSource, p: Vec3): OffsetSource {
  const pl = scene.parts[src.plane];
  if (!pl || pl.kind !== "plane") return src;
  const n = normalOfPlane(pl);
  const q = sub(p, scale(n, dot(sub(p, pl.at), n))); // (the pointer's place, on the plane)
  if (src.kind === "circle") {
    const w = sub(q, src.centre);
    const l = Math.hypot(w[0], w[1], w[2]);
    if (l < 1e-9) return src;
    const dir = scale(w, 1 / l);
    return { ...src, origin: add(src.centre, scale(dir, src.radius)), normal: dir };
  }
  if (src.kind === "group") {
    let best: { item: OffsetSource; d: number } | null = null;
    for (const it of src.items) {
      const near = offsetNear(scene, it, p);
      const d = Math.hypot(...sub(near.origin, q));
      if (!best || d < best.d) best = { item: near, d };
    }
    return best ? { ...src, origin: best.item.origin, normal: best.item.normal } : src;
  }
  if (src.kind === "set") {
    let best: { at: Vec3; n: Vec3; d: number } | null = null;
    for (const l of src.lines) {
      const d = sub(l.b, l.a);
      const t = Math.min(1, Math.max(0, dot(sub(q, l.a), d) / (dot(d, d) || 1)));
      const at = add(l.a, scale(d, t));
      const dist = Math.hypot(...sub(at, q));
      if (!best || dist < best.d) best = { at, n: l.normal, d: dist };
    }
    return best ? { ...src, origin: best.at, normal: best.n } : src;
  }
  if (src.kind === "line") {
    const d = sub(src.b, src.a);
    const t = Math.min(1, Math.max(0, dot(sub(q, src.a), d) / (dot(d, d) || 1)));
    return { ...src, origin: add(src.a, scale(d, t)) };
  }
  if (src.kind === "loop") {
    const P = src.pts;
    const s = area2(P.map((x) => localOf(pl, x))) > 0 ? 1 : -1;
    let best: { at: Vec3; out: Vec3; d: number } | null = null;
    for (let i = 0; i < P.length; i++) {
      const [a, b] = [P[i]!, P[(i + 1) % P.length]!];
      const d = sub(b, a);
      const t = Math.min(1, Math.max(0, dot(sub(q, a), d) / (dot(d, d) || 1)));
      const at = add(a, scale(d, t));
      const dist = Math.hypot(...sub(at, q));
      if (best && dist >= best.d) continue;
      const len = Math.hypot(...d) || 1;
      const dl: V2 = [dot(d, pl.u) / len, dot(d, pl.v) / len];
      best = { at, d: dist, out: add(scale(pl.u, s * dl[1]), scale(pl.v, -s * dl[0])) };
    }
    return best ? { ...src, origin: best.at, normal: best.out } : src;
  }
  if (src.kind === "outline") {
    const r = outlineNear(scene, src, q);
    return r ? { ...src, origin: r.origin, normal: r.normal } : src;
  }
  // a face with holes: the arrow goes to the nearest of its loops' edges (the loops themselves are offset together, whichever it stands on)
  const near = src.loops.map((l) => outlineNear(scene, l, q)).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => a.dist - b.dist)[0];
  return near ? { ...src, origin: near.origin, normal: near.normal } : src;
}
