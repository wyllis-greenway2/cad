// A cam or a ratchet that keeps its numbers (`dec_spline_and_cams`, `dec_ratchet`): the scene holds a record as a gear's (`gearscene.ts`: `GearRecord` with `spec.cam`), and the parts are made from it each time the scene is
// derived: locked, named by the record and their place (`d/g_003.s0`), so a step made from them finds them again and changing the numbers changes the cam and the bodies made from it. Pure: scenes in, parts out.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "./scene.ts";
import type { Part } from "./part.ts";
import { normalOfPlane } from "./part.ts";
import type { GearRecord } from "./gearscene.ts";
import { camShapes } from "./cams.ts";
import type { CamShapes } from "./cams.ts";
import { closedSides } from "./splinering.ts";
import { splineStored } from "./part.ts";
import { loopFaceRef, diskFaceRef } from "./loops.ts";

const shapesOf = (rec: GearRecord): CamShapes | null => { const c = rec.spec.cam ? camShapes(rec.spec.cam) : null; return c && c.ok ? c.value : null; };
/** the names of a circle's centre and its ring: the disc of an eccentric `c`, `k`; the hole at the shaft `bc`, `b`; other holes `qc`, `q` (the second `qc1`, `q1`, and so on) */
const circleNames = (c: CamShapes["circles"][number], other: number): { centre: string; ring: string } => (c.hole ? (Math.hypot(...c.c) < 1e-9 ? { centre: "bc", ring: "b" } : { centre: `qc${other || ""}`, ring: `q${other || ""}` }) : { centre: "c", ring: "k" });
/** The outline's sides in order (what a step that extrudes the cam names), the circle of an eccentric's disc, and the shaft's hole; empty if the numbers make no cam. */
export function camRefs(rec: GearRecord): { lines: Ref[]; wall?: Ref; bore?: string } {
  const sh = shapesOf(rec);
  if (!sh) return { lines: [] };
  const hole = sh.circles.some((c) => c.hole && Math.hypot(...c.c) < 1e-9);
  const bore = hole ? { bore: drawnRef(`${rec.id}.b`) as string } : {};
  if (sh.polys?.length) return { lines: sh.polys[0]!.points.map((_, i) => drawnRef(`${rec.id}.s${i}`)), ...bore };
  if (sh.closed || sh.spiral) return { lines: [drawnRef(`${rec.id}.s0`), drawnRef(`${rec.id}.s1`)], ...bore };
  return { lines: [], wall: drawnRef(`${rec.id}.k`), ...bore };
}
/** The face of the cam's outline: the loop of its sides, or the disk of its circle (what is selected after it is made). */
export const camFace = (rec: GearRecord): Ref | null => { const r = camRefs(rec); return r.wall ? diskFaceRef(r.wall) : r.lines.length ? loopFaceRef(r.lines) : null; };

/** The parts of a cam: its corners, sides and circles, locked. Empty if its plane is not there or the numbers make no cam. */
export function camParts(s: Scene, rec: GearRecord): Part[] {
  const plane = s.parts[rec.plane];
  const sh = shapesOf(rec);
  if (!plane || plane.kind !== "plane" || !sh) return [];
  const [ct, st] = [Math.cos(rec.turn ?? 0), Math.sin(rec.turn ?? 0)];
  const at = (q: readonly [number, number]): Vec3 => { const p = [q[0] * ct - q[1] * st, q[0] * st + q[1] * ct]; return [rec.at[0] + plane.u[0] * p[0]! + plane.v[0] * p[1]!, rec.at[1] + plane.u[1] * p[0]! + plane.v[1] * p[1]!, rec.at[2] + plane.u[2] * p[0]! + plane.v[2] * p[1]!]; };
  const normal = normalOfPlane(plane);
  const base = { origin: "drawn" as const, plane: rec.plane, movable: false };
  const out: Part[] = [];
  const ref = (name: string): Ref => drawnRef(`${rec.id}.${name}`);
  const corner = (name: string, p: Vec3): void => { out.push({ ...base, ref: ref(name), kind: "corner", at: p }); };
  if (sh.closed) { // a disc cam: one closed spline, two sides between two corners
    const sides = closedSides(sh.closed.map(at), normal);
    if (!sides) return [];
    corner("p0", sides[0]!.from); corner("p1", sides[0]!.to);
    out.push({ ...base, ref: ref("s0"), kind: "line", a: ref("p0"), b: ref("p1"), spline: sides[0]!.spline, around: sides[0]!.around });
    out.push({ ...base, ref: ref("s1"), kind: "line", a: ref("p1"), b: ref("p0"), spline: sides[1]!.spline, around: sides[1]!.around });
  }
  if (sh.spiral) { // a snail cam: the spiral, and the straight side that closes it
    const pts = sh.spiral.map(at);
    const stored = splineStored(pts, normal);
    if (!stored) return [];
    corner("p0", pts[0]!); corner("p1", pts[pts.length - 1]!);
    out.push({ ...base, ref: ref("s0"), kind: "line", a: ref("p0"), b: ref("p1"), spline: stored });
    out.push({ ...base, ref: ref("s1"), kind: "line", a: ref("p1"), b: ref("p0") });
  }
  (sh.polys ?? []).forEach((poly, j) => { // a ratchet: the wheel's outline, then the pawl's (its corners a, its sides t)
    const [cn, sn] = j === 0 ? ["p", "s"] : ["a", "t"];
    poly.points.forEach((p, i) => corner(`${cn}${i}`, at(p)));
    poly.points.forEach((_, i) => out.push({ ...base, ref: ref(`${sn}${i}`), kind: "line", a: ref(`${cn}${i}`), b: ref(`${cn}${(i + 1) % poly.points.length}`), ...(poly.bulges[i] ? { bulge: poly.bulges[i]! } : {}) }));
  });
  (sh.rings ?? []).forEach((ring, j) => { // more closed splines (a Geneva drive's locking disc): corners r, sides v
    const sides = closedSides(ring.map(at), normal);
    if (!sides) return;
    corner(`r${j}a`, sides[0]!.from); corner(`r${j}b`, sides[0]!.to);
    out.push({ ...base, ref: ref(`v${j}a`), kind: "line", a: ref(`r${j}a`), b: ref(`r${j}b`), spline: sides[0]!.spline, around: sides[0]!.around });
    out.push({ ...base, ref: ref(`v${j}b`), kind: "line", a: ref(`r${j}b`), b: ref(`r${j}a`), spline: sides[1]!.spline, around: sides[1]!.around });
  });
  let others = 0;
  for (const c of sh.circles) {
    const n = circleNames(c, c.hole && Math.hypot(...c.c) >= 1e-9 ? others++ : 0);
    corner(n.centre, at(c.c));
    out.push({ ...base, ref: ref(n.ring), kind: "circle", center: ref(n.centre), radius: c.r });
  }
  return out;
}
