// Offset (`in_177`): a copy of a drawn figure moved in or out by a distance, drawn on the same plane. A closed figure of straight sides gets a new one with every side moved and the corners where the
// neighbouring sides meet (a rectangle stays a rectangle); a circle gets a concentric one; a line, a parallel line. Positive is out of the figure (a line: to the side its arrow points), negative in.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId, lookup } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Part, Plane } from "../operation/part.ts";
import { pointOf, normalOfPlane } from "../operation/part.ts";
import { drawChain, drawCircle } from "../operation/build.ts";
import { bodyOutline, bodyOutlines, outlineCommand, drawnOutline } from "./offsetbody.ts";
import type { Line } from "../operation/part.ts";
import { apply } from "../operation/commands.ts";
import type { Outline } from "./offsetbody.ts";

export type OffsetSource =
  | { kind: "loop"; plane: Ref; pts: Vec3[]; origin: Vec3; normal: Vec3 }
  | { kind: "circle"; plane: Ref; circle: Ref; centre: Vec3; radius: number; origin: Vec3; normal: Vec3 }
  | { kind: "line"; plane: Ref; a: Vec3; b: Vec3; origin: Vec3; normal: Vec3 }
  | Outline
  /** a flat face of the body with holes: every loop of it, the outer one first; they are offset together (`in_228`) */
  | { kind: "outlines"; plane: Ref; origin: Vec3; normal: Vec3; loops: Outline[] };

type V2 = [number, number];
const local = (pl: Plane, p: Vec3): V2 => [dot(sub(p, pl.at), pl.u), dot(sub(p, pl.at), pl.v)];
const lift = (pl: Plane, q: V2): Vec3 => add(pl.at, add(scale(pl.u, q[0]), scale(pl.v, q[1])));
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
  // what is picked of a drawn figure is often more than one part: a face is picked with its sides and corners, or a few sides, or a chain of lines and arcs. They are one outline (`in_232`)
  if (parts.length && parts.every((p) => p.origin === "drawn")) {
    const faces = parts.filter((p) => p.kind === "face");
    const face = faces.length === 1 ? (faces[0] as Extract<Part, { kind: "face" }>) : null;
    const lineRefs = face && !face.disk && face.loop.length && parts.every((p) => p === face || ((p.kind === "line" || p.kind === "corner") && p.plane === face.plane)) ? face.loop : null; // (its own sides and corners, or the whole lines the pieces were cut from)
    const chain = !faces.length ? parts.filter((p): p is Line => p.kind === "line") : [];
    const picked = lineRefs ? lineRefs.map((r) => get(r)).filter((l): l is Line => l?.kind === "line") : chain;
    const rest = !faces.length && parts.every((p) => p.kind === "line" || (p.kind === "corner" && chain.some((l) => l.a === p.ref || l.b === p.ref)));
    const curvy = picked.some((l) => l.center);
    const usable = picked.length > 0 && (lineRefs || rest) && !picked.some((l) => l.bulge);
    if (usable && curvy) return drawnOutline(scene, picked); // arcs in it
    if (usable && !lineRefs && picked.length > 1) return drawnOutline(scene, picked); // a chain of straight sides picked by its sides
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
    if (lines.some((l) => l?.kind !== "line" || l.center || l.bulge)) return null; // straight sides only
    const pts = face.corners.map((c) => pointOf(get, c));
    if (pts.length < 3 || pts.some((p) => !p)) return null;
    const P = pts as Vec3[];
    const q = P.map((p) => local(pl, p));
    const a0 = q[0]!, a1 = q[1]!;
    const d: V2 = [a1[0] - a0[0], a1[1] - a0[1]];
    const len = Math.hypot(...d) || 1;
    const s = area2(q) > 0 ? 1 : -1; // counter-clockwise: out is to the right of each side
    const out: V2 = [(s * d[1]) / len, (-s * d[0]) / len];
    return { kind: "loop", plane: planeRef, pts: P, origin: lift(pl, [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2]), normal: add(scale(pl.u, out[0]), scale(pl.v, out[1])) };
  }
  if (first.kind === "line" && !first.center && !first.bulge) {
    const [a, b] = [pointOf(get, first.a), pointOf(get, first.b)];
    if (!a || !b) return null;
    const dir = normalize(sub(b, a));
    return { kind: "line", plane: planeRef, a, b, origin: scale(add(a, b), 0.5), normal: normalize(cross(normalOfPlane(pl), dir)) };
  }
  return null;
}

/** The command that draws the offset figure `v` out (a negative `v` is in), or null when there is none (an inward offset past the middle, a circle of no size). */
export function offsetCommand(scene: Scene, src: OffsetSource, v: number): Command | null {
  const pl = lookup(scene)(src.plane);
  if (!pl || pl.kind !== "plane" || Math.abs(v) < 1e-9) return null;
  if (src.kind === "outline") return outlineCommand(scene, src, v);
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
  const q = src.pts.map((p) => local(pl, p));
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
  return drawChain(scene, src.plane, corners.map((c) => lift(pl, c)), true).command;
}
