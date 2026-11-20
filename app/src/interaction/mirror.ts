// A mirror copy (`in_433`, `in_437`): a drawn figure or a body copied as its reflection in a plane. The plane is set with the mover's own arrows: an arrow along each axis stands in the middle of what is mirrored
// and ends at the plane across that axis (a small plane is drawn there for the arrow that is chosen); pulling an arrow or typing its number moves the plane, taking an arrow chooses it. It begins at the
// side of what is mirrored (the copy lands against it), on the axis the view looks across. This file is the mirror plane and the step it makes.
import type { Vec3 } from "../math/vec.ts";
import { cross, normalize, sub } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import type { Op } from "./operations.ts";

const UNIT: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** Where the plane stands to begin with: at the far side of the box of what is mirrored along each axis (a face selected with the body, if it faces along an axis, takes its axis), and which axis. */
export function mirrorStart(box: { lo: Vec3; hi: Vec3 }, face: { p: Vec3; n: Vec3 } | null, viewRight: 0 | 1 | 2): { at: Vec3; axis: 0 | 1 | 2 } {
  const at: Vec3 = [box.hi[0], box.hi[1], box.hi[2]];
  let axis = viewRight;
  if (face) { const k = [0, 1, 2].find((i) => Math.abs(Math.abs(face.n[i]!) - 1) < 1e-6) as 0 | 1 | 2 | undefined; if (k !== undefined) { axis = k; (at as unknown as number[])[k] = face.p[k]!; } }
  return { at, axis };
}
/** The middle of the box mirrored: where the arrows start. */
export const mirrorCentre = (op: Op): Vec3 => (op.mirrorBox ? [0, 1, 2].map((i) => (op.mirrorBox!.lo[i]! + op.mirrorBox!.hi[i]!) / 2) as unknown as Vec3 : [0, 0, 0]);
/** The plane in force: a point on it and its normal: the chosen axis of the mover (its frame if it was turned, `in_440`), at the distance the arrow ends from the orb (which is where the mover was put). */
export function mirrorPlane(op: Op): { p: Vec3; n: Vec3 } | null {
  const k = op.mirrorAxis ?? 0;
  const at = op.mirrorAt;
  if (!at || !op.mirrorBox) return null;
  const centre = mirrorCentre(op);
  const n = op.frame?.[k] ?? UNIT[k]!;
  const o = op.pivot ?? centre;
  const d = at[k]! - centre[k]!; // (how far the plane stands from the orb along the axis)
  return { p: [o[0] + n[0] * d, o[1] + n[1] * d, o[2] + n[2] * d], n };
}

/**
 * The plane set by a click on a line or a face (`in_1306`): the mover is turned so its chosen axis is the plane's normal and put on the plane (the arrow then moves the plane off it). `null` for a point that is
 * not a plane. A line is the hinge: the plane holds it and stands across the drawing's sheet (`sheet` is the sheet's normal; with a body, which has none, across the vertical).
 */
export function mirrorAcross(op: Op, hit: { kind: "face"; at: Vec3; n: Vec3 } | { kind: "line"; a: Vec3; b: Vec3; sheet?: Vec3 }): Op | null {
  if (!op.mirrorBox || !op.mirrorAt) return null;
  let at: Vec3, n: Vec3;
  if (hit.kind === "face") { at = hit.at; n = hit.n; } else {
    const d = sub(hit.b, hit.a);
    const ref: Vec3 = hit.sheet ?? (Math.abs(d[2]) < 0.9 * Math.hypot(d[0], d[1], d[2]) ? [0, 0, 1] : [1, 0, 0]);
    n = cross(d, ref); at = hit.a;
  }
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-9) return null;
  n = [n[0] / len, n[1] / len, n[2] / len];
  const k = op.mirrorAxis ?? 0;
  const u = normalize(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n));
  const w = cross(n, u);
  // (the chosen axis takes the normal; the other two are across it)
  const fr: Vec3[] = k === 2 ? [u, w, n] : k === 1 ? [u, n, cross(u, n)] : [n, u, cross(n, u)];
  const centre = mirrorCentre(op);
  const mirrorAt: Vec3 = [centre[0], centre[1], centre[2]];
  return { ...op, auto: false, pivot: at, frame: fr as unknown as [Vec3, Vec3, Vec3], mirrorAt, mirrorAxis: k };
}

/** The step of the mirror: a body gets a step of its own with the plane's numbers; a drawn figure a record that keeps them, its copies made from it (as a repeat's are). */
export function mirrorCommand(scene: Scene, op: Op): Command | null {
  const c = mirrorPlane(op);
  if (!c) return null;
  const numbers = { px: c.p[0], py: c.p[1], pz: c.p[2], nx: c.n[0], ny: c.n[1], nz: c.n[2] };
  if (op.target !== "plane") {
    const mine = scene.parts[op.parts[0]!];
    const body: Record<string, string> = mine?.kind === "body" && mine.ref !== BODY_OBJECT && mine.id ? { body: mine.id } : {};
    return { type: "addStep", step: { id: nextId(scene, "s"), type: "pattern", parts: op.parts, params: { mode: "mirror", ...numbers, ...body } } };
  }
  const first = op.parts.map((r) => scene.parts[r]).find((p) => p?.kind === "corner");
  const plane = first?.plane ? scene.parts[first.plane] : undefined;
  if (!plane || plane.kind !== "plane") return null;
  return { type: "pattern", id: nextId(scene, "q"), kind: "mirror", parts: op.parts, plane: plane.ref, params: [c.p[0], c.p[1], c.p[2], c.n[0], c.n[1], c.n[2]] };
}
