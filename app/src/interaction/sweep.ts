// A sweep (`dec_sweep`, `in_444`): a closed figure carried along a path of lines and arcs drawn anywhere, ending in a body. This file reads the path from what is selected and makes the step; the kernel
// makes the body (`sweep` in `interpreter.mjs`).
import type { Scene } from "../operation/scene.ts";
import { nextId, figureParams, lookup } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import type { Command } from "../operation/commands.ts";
import { walkPath } from "../operation/path.ts";
import { normalOfPlane } from "../operation/part.ts";
import type { Op } from "./operations.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Rigid } from "../operation/frames.ts";
import { aboutDir } from "../math/rotation.ts";
import { extrudeCap } from "./operations.ts";

/** The step of a sweep: the shape is the step's figure, the path is the lines it follows (named, so it follows a later edit of them). */
export function sweepCommand(scene: Scene, op: Op): Command | null {
  if (!op.sweepFig || !op.sweepLines?.length) return null;
  return { type: "addStep", step: { id: nextId(scene, "s"), type: "sweep", parts: op.sweepFig.outer, params: { ...figureParams([op.sweepFig]), path: op.sweepLines.join(",") } } };
}


/** The corner the shape is carried from, to show as a dot: the end of the path nearer the shape's plane. */
export function sweepStart(scene: Scene, op: Op): Ref[] {
  if (!op.sweepFig || !op.sweepLines) return [];
  const get = lookup(scene);
  const walked = walkPath(get, op.sweepLines);
  const first = get(op.sweepFig.outer[0]!);
  const plane = first && "plane" in first && first.plane ? get(first.plane) : undefined;
  if (!walked.ok || !plane || plane.kind !== "plane") return [];
  const n = normalOfPlane(plane);
  const off = (q: readonly number[]): number => Math.abs((q[0]! - plane.at[0]) * n[0] + (q[1]! - plane.at[1]) * n[1] + (q[2]! - plane.at[2]) * n[2]);
  const [head, tail] = [walked.sides[0]!, walked.sides.at(-1)!];
  return [off(tail.b) < off(head.a) ? tail.to : head.from]; // (the end nearer the shape's plane, as the kernel takes it)
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit3 = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Points along one side of the path (a line, or an arc through its middle point), the first and last included. */
function along(a: Vec3, b: Vec3, m: Vec3 | null, steps: number): Vec3[] {
  if (!m) return Array.from({ length: steps + 1 }, (_, i): Vec3 => [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps, a[2] + ((b[2] - a[2]) * i) / steps]);
  const [v1, v2] = [sub3(m, a), sub3(b, a)];
  const n = cross3(v1, v2);
  const nn = dot3(n, n);
  if (nn < 1e-18) return along(a, b, null, steps); // (three points on a line)
  const [p, q] = [cross3(v2, n), cross3(n, v1)];
  const c: Vec3 = [a[0] + (dot3(v1, v1) * p[0] + dot3(v2, v2) * q[0]) / (2 * nn), a[1] + (dot3(v1, v1) * p[1] + dot3(v2, v2) * q[1]) / (2 * nn), a[2] + (dot3(v1, v1) * p[2] + dot3(v2, v2) * q[2]) / (2 * nn)];
  const e1 = unit3(sub3(a, c)), e2 = cross3(unit3(n), e1);
  const ang = (x: Vec3): number => Math.atan2(dot3(sub3(x, c), e2), dot3(sub3(x, c), e1));
  let tb = ang(b);
  const tm = ang(m);
  if (tb < 0) tb += 2 * Math.PI;
  let tmid = tm < 0 ? tm + 2 * Math.PI : tm;
  const sweep = tmid <= tb ? tb : tb - 2 * Math.PI; // (the way round that passes the middle point)
  const r = Math.hypot(...sub3(a, c));
  return Array.from({ length: steps + 1 }, (_, i): Vec3 => { const th = (sweep * i) / steps; return [c[0] + r * (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]), c[1] + r * (Math.cos(th) * e1[1] + Math.sin(th) * e2[1]), c[2] + r * (Math.cos(th) * e1[2] + Math.sin(th) * e2[2])]; });
}

/**
 * Where the sweep's shape stands along its path (`in_482`): the triangles of the shape and, for stations along the path, the motion that takes the shape there (the path's end nearer the shape's plane is carried onto
 * the plane, the shape keeps its place beside it, and it turns with the path's direction, as the kernel carries it). Null when it is not a sweep that can be read.
 */
export function sweepCarry(scene: Scene, op: Op): { tris: number[]; carries: Rigid[] } | null {
  const cap = extrudeCap(scene, op);
  if (!cap || !op.sweepLines) return null;
  const walked = walkPath(lookup(scene), op.sweepLines);
  if (!walked.ok) return null;
  const N = cap.normal, p0: Vec3 = [cap.tris[0]!, cap.tris[1]!, cap.tris[2]!];
  const off = (q: Vec3): number => dot3(sub3(q, p0), N);
  let sides = walked.sides.map((s) => ({ a: s.a, b: s.b, m: s.m }));
  if (Math.abs(off(sides.at(-1)!.b)) < Math.abs(off(sides[0]!.a))) sides = sides.map((s) => ({ a: s.b, b: s.a, m: s.m })).reverse();
  const lift = off(sides[0]!.a);
  const points: Vec3[] = [];
  for (const s of sides) { const pts = along(s.a, s.b, s.m, 24); points.push(...(points.length ? pts.slice(1) : pts)); }
  const down = (q: Vec3): Vec3 => [q[0] - N[0] * lift, q[1] - N[1] * lift, q[2] - N[2] * lift];
  const path = points.map(down);
  const tangent = (i: number): Vec3 => unit3(sub3(path[Math.min(i + 1, path.length - 1)]!, path[Math.max(i - 1, 0)]!));
  const t0 = tangent(0);
  const carries = path.map((q, i): Rigid => {
    const ti = tangent(i);
    const axis = cross3(t0, ti);
    const angle = (Math.atan2(Math.hypot(...axis), dot3(t0, ti)) * 180) / Math.PI;
    const R = Math.hypot(...axis) < 1e-9 ? ([1, 0, 0, 0, 1, 0, 0, 0, 1] as Rigid["turn"]) : aboutDir(unit3(axis), angle);
    const rq: Vec3 = [R[0] * path[0]![0] + R[1] * path[0]![1] + R[2] * path[0]![2], R[3] * path[0]![0] + R[4] * path[0]![1] + R[5] * path[0]![2], R[6] * path[0]![0] + R[7] * path[0]![1] + R[8] * path[0]![2]];
    return { turn: R, shift: [q[0] - rq[0], q[1] - rq[1], q[2] - rq[2]], k: 1 };
  });
  return { tris: cap.tris, carries };
}
