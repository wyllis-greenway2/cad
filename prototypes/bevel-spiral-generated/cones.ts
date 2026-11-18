// (helpers) The spiral bevel pair made by the gearing law with cone ends, in the kernel, for several tooth counts and spiral angles (`in_798`): each gear is a prism of the tooth sections (a loft through planes from the toe's cone to the heel's, beyond the face by what the
// cones need) intersected with the blank of the two back cones; the measure is the overlap of the pair (nothing at the meshing place, the same rolled, a lot half a pitch round).
import assert from "node:assert/strict";
import { pairOf, flankGrid, contourAt, outlineAt, blankFor } from "./sections.ts";
import type { Pair, Gear } from "./sections.ts";
import type { V3 } from "./generate.ts";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawChain } from "../../app/src/operation/build.ts";
import { nextId, figureParams } from "../../app/src/operation/scene.ts";
import { drawnRef } from "../../app/src/shared/ref.ts";

const deg = (d: number) => (d * Math.PI) / 180;
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];

/** a pair of tooth counts, the normal module, the mean spiral angle (degrees); shafts at 90 degrees, a face of 0.3 of the mean cone distance, the cutter radius 0.88 of it, 20 degrees */
export function pairFor(z1: number, z2: number, mn: number, betaDeg: number) {
  const g1 = Math.atan(z1 / z2), g2 = Math.PI / 2 - g1, bm = deg(betaDeg);
  const mf = mn / Math.cos(bm), RM = (mf * z2) / (2 * Math.sin(g2)), b = 0.3 * RM;
  return pairOf({ crown: { RM, RW: 0.88 * RM, beta: bm, tB: Math.PI * mn, alpha: deg(20), gamma: g2, hand: 1 }, z1, z2, mn, b, bl: 0.05 });
}

export function gearBody(s: Session, pr: Pair, which: "pinion" | "ring", turn: number, N: number, combine = true): Session {
  let g: Gear = which === "pinion" ? pr.pinion : pr.ring;
  const RM = pr.spec.crown.RM, b = pr.spec.b, m = pr.spec.mn;
  // AXZ: the gear built with its axis along z (its flank surfaces turned to it): cones about a tilted axis are harder for the kernel than about an axis of the frame
  let turnTo: ((p: V3) => V3) | null = null;
  if (process.env.AXZ) {
    const a = g.axis, k = cross3(a, [0, 0, 1]), sn = Math.hypot(...k), cs = a[2];
    if (sn > 1e-9) { const kk: V3 = [k[0] / sn, k[1] / sn, k[2] / sn]; turnTo = (p) => { const d = kk[0] * p[0] + kk[1] * p[1] + kk[2] * p[2], c = cross3(kk, p); return [p[0] * cs + c[0] * sn + kk[0] * d * (1 - cs), p[1] * cs + c[1] * sn + kk[1] * d * (1 - cs), p[2] * cs + c[2] * sn + kk[2] * d * (1 - cs)]; }; g = { ...g, axis: [0, 0, 1] }; }
  }
  const bl = blankFor(g, RM - b / 2, RM + b / 2, m);
  if (typeof bl === "string") throw new Error(`${which}: ${bl}`);
  const grid = (f: "A" | "B") => { const q = flankGrid(pr, which, f); return turnTo ? { P: q.P.map((row) => row.map((p) => turnTo!(p))) } : q; };
  const [A, B] = [grid("A"), grid("B")];
  const u: V3 = [1, 0, 0], v = cross3(g.axis, u);
  const secs: string[][] = [];
  for (let i = 0; i < N; i++) {
    const X = bl.xS + ((bl.xB - bl.xS) * i) / (N - 1);
    const o = outlineAt(g, which, contourAt(A, g.axis, X), contourAt(B, g.axis, X), X);
    if (!o) throw new Error(`${which}: no outline at X ${X.toFixed(1)}`);
    const at: V3 = [g.axis[0] * X, g.axis[1] * X, g.axis[2] * X];
    const ref = drawnRef(nextId(scene(s), "p"));
    s = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at, u, v } } as never);
    const pts = o.map(([r, f]): V3 => [at[0] + r * Math.cos(f + turn) * u[0] + r * Math.sin(f + turn) * v[0], at[1] + r * Math.cos(f + turn) * u[1] + r * Math.sin(f + turn) * v[1], at[2] + r * Math.cos(f + turn) * u[2] + r * Math.sin(f + turn) * v[2]]);
    const ch = drawChain(scene(s), ref as never, pts, true);
    s = run(s, ch.command);
    secs.push(ch.lines as string[]);
  }
  const loftId = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: loftId, type: "loft", parts: secs[0] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), mode: "new", ...(process.env.RULED ? { ruled: 1 } : {}) } } } as never);
  if (s.message) throw new Error(`${which}: ${s.message}`);
  // the blank: its section on a plane through the axis (radius along the first direction, the axis along the second), revolved about the axis, intersected with the prism. The kernel cannot always cut where the cone passes through the corners of the
  // teeth (the intersection answers "nothing in common"): the cones are then moved along the axis by a fraction of a millimetre, as far as the first that it can cut
  const prism = s;
  let last = "";
  for (const dx of [Number(process.env.CONE_DX ?? -0.67 * m)]) { // (one try: a failed boolean can leave the kernel unable to go on; -0.7 mm is where the cut of the 20 / 30 ring gear, which failed with the cones at 0 to +3, worked)
    const bl = blankFor(g, RM - b / 2, RM + b / 2, m, dx);
    if (typeof bl === "string") throw new Error(`${which}: ${bl}`);
    if (process.env.VARIANT === "big") bl.polygon = [[bl.xS - 5, 0], [bl.xS - 5, 400], [bl.xB + 20, 400], [bl.xB + 20, 0]];
    if (process.env.VARIANT === "heel") bl.polygon = [bl.polygon[0]!, bl.polygon[1]!, bl.polygon[2]!, [bl.polygon[2]![0], 0]];
    if (process.env.VARIANT === "toe") bl.polygon = [[bl.polygon[1]![0] + 1000, 0], [bl.polygon[1]![0] + 1000, bl.polygon[3]![1] + 1000], bl.polygon[3]!, bl.polygon[4]!, bl.polygon[5]!];
    s = prism;
    const bp = drawnRef(nextId(scene(s), "p"));
    // the blank's sketch plane may be turned about the axis so that the seam of its cones is not where the teeth's corners are (SEAM, radians)
    const sa = Number(process.env.SEAM ?? 0), ub: V3 = [u[0] * Math.cos(sa) + v[0] * Math.sin(sa), u[1] * Math.cos(sa) + v[1] * Math.sin(sa), u[2] * Math.cos(sa) + v[2] * Math.sin(sa)];
    s = run(s, { type: "addPart", part: { ref: bp, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, 0, 0], u: ub, v: g.axis } } as never);
    let poly = bl.polygon.map(([x, r]): [number, number] => [r, x]);
    const area = poly.reduce((acc, p, i) => { const q = poly[(i + 1) % poly.length]!; return acc + (p[0] * q[1] - q[0] * p[1]); }, 0);
    if (area < 0) poly = poly.slice().reverse();
    const pts3 = poly.map(([r, x]): V3 => [ub[0] * r + g.axis[0] * x, ub[1] * r + g.axis[1] * x, ub[2] * r + g.axis[2] * x]);
    const ch = drawChain(scene(s), bp as never, pts3, true);
    s = run(s, ch.command);
    const revId = nextId(scene(s), "s");
    s = run(s, { type: "addStep", step: { id: revId, type: "revolve", parts: ch.lines as never, params: { angle: 360, advance: 0, ax: 0, ay: 0, az: 0, dx: g.axis[0], dy: g.axis[1], dz: g.axis[2], mode: "new" } } } as never);
    if (s.message) { last = `${which} blank: ${s.message}`; continue; }
    if (!combine) return s;
    if (process.env.CUT) { // the cones as two solids taken away from the prism (beyond the heel's cone, beyond the toe's), in place of the one blank intersected with it
      const solid = (poly0: [number, number][]): string => {
        const q = drawnRef(nextId(scene(s), "p"));
        s = run(s, { type: "addPart", part: { ref: q, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, 0, 0], u, v: g.axis } } as never);
        let pl = poly0.map(([x, r]): [number, number] => [r, x]);
        const ar = pl.reduce((acc, p, i) => { const w = pl[(i + 1) % pl.length]!; return acc + (p[0] * w[1] - w[0] * p[1]); }, 0);
        if (ar < 0) pl = pl.slice().reverse();
        const c2 = drawChain(scene(s), q as never, pl.map(([r, x]): V3 => [u[0] * r + g.axis[0] * x, u[1] * r + g.axis[1] * x, u[2] * r + g.axis[2] * x]), true);
        s = run(s, c2.command);
        const id = nextId(scene(s), "s");
        s = run(s, { type: "addStep", step: { id, type: "revolve", parts: c2.lines as never, params: { angle: 360, advance: 0, ax: 0, ay: 0, az: 0, dx: g.axis[0], dy: g.axis[1], dz: g.axis[2], mode: "new" } } } as never);
        if (s.message) throw new Error(`${which} cut solid: ${s.message}`);
        return id;
      };
      const [hId, tId] = [solid(bl.outH), solid(bl.outT)];
      const c1 = nextId(scene(s), "s");
      s = run(s, { type: "addStep", step: { id: c1, type: "combine", parts: [`b/x_${loftId}/o`, `b/x_${hId}/o`] as never, params: { mode: "subtract" } } } as never);
      if (s.message) { last = `${which} heel cut: ${s.message}`; continue; }
      const c2 = nextId(scene(s), "s");
      s = run(s, { type: "addStep", step: { id: c2, type: "combine", parts: [`b/x_${loftId}/o`, `b/x_${tId}/o`] as never, params: { mode: "subtract" } } } as never);
      if (s.message) { last = `${which} toe cut: ${s.message}`; continue; }
      const rest = bodies(s);
      if (rest.length !== 1) { last = `${which}: ${rest.length} bodies left`; continue; }
      CONE_SHIFT.last = dx;
      return s;
    }
    const comId = nextId(scene(s), "s");
    s = run(s, { type: "addStep", step: { id: comId, type: "combine", parts: [`b/x_${loftId}/o`, `b/x_${revId}/o`] as never, params: { mode: "intersect" } } } as never);
    if (s.message) { last = `${which} cone ends: ${s.message}`; continue; }
    CONE_SHIFT.last = dx;
    return s;
  }
  throw new Error(last);
}
export const CONE_SHIFT = { last: 0 };
export function overlap(pr: Pair, turnPinion: number, turnRing: number, N: number): { vol: number; none: boolean; vols: number[] } {
  let s = createSession(kernel);
  s = gearBody(s, pr, "pinion", turnPinion, N);
  s = gearBody(s, pr, "ring", turnRing, N);
  const b = bodies(s);
  assert.equal(b.length, 2, `two bodies, got ${b.length}`);
  const vols = b.map((x) => Math.round(x.volume));
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect" } } } as never);
  if (/nothing in common/.test(done.message ?? "")) return { vol: 0, none: true, vols };
  return { vol: bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0, none: false, vols };
}

