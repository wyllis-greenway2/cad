// The bodies of a crown gear and its straight bevel pinion in the kernel (`dec_crown_gears`, a prototype): the crown a plate with teeth (each tooth a ruled loft of three sections, exact since its flanks are planes, the teeth and the plate fused), the pinion
// the prism of its flank sections cut to the blank of two back cones (as `prototypes/bevel-spiral-generated/cones.ts`).
import assert from "node:assert/strict";
import { crownPair, flankAngle, pinionGrid } from "./crown.ts";
import type { CrownPair, CrownSpec } from "./crown.ts";
import { contourAt, outlineAt, blankFor } from "../bevel-spiral-generated/sections.ts";
import type { V3 } from "../bevel-spiral-generated/generate.ts";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawChain } from "../../app/src/operation/build.ts";
import { nextId, figureParams } from "../../app/src/operation/scene.ts";
import { drawnRef } from "../../app/src/shared/ref.ts";

const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];
export const example = (): CrownPair => crownPair({ zc: 40, z1: 18, module: 2, alpha: (20 * Math.PI) / 180, rIn: 34, rOut: 46, bl: 0.05 });

/** a closed outline on the plane across the crown's axis at the height y: polar points (radius, angle from z towards x) as a drawn chain; the plane has the x axis and -z as its directions, so the angle in the plane is the angle from z towards x less 90 degrees */
function section(s: Session, y: number, pts: [number, number][]): { s: Session; lines: string[]; plane: string } {
  const u: V3 = [1, 0, 0], v: V3 = [0, 0, -1];
  const ref = drawnRef(nextId(scene(s), "p"));
  s = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, y, 0], u, v } } as never);
  const p3 = pts.map(([r, psi]): V3 => { const f = -Math.PI / 2 + psi; return [r * Math.cos(f) * u[0] + r * Math.sin(f) * v[0], y, r * Math.cos(f) * u[2] + r * Math.sin(f) * v[2]]; });
  const ch = drawChain(scene(s), ref as never, p3, true);
  return { s: run(s, ch.command), lines: ch.lines as string[], plane: ref };
}
/** the crown: `teeth` teeth from the middle one outwards each way, the plate over them; the crown turned by `turn` about its axis */
export function crownBody(s: Session, cp: CrownPair, teeth: number, turn: number): Session {
  const { rIn, rOut, module: m, zc } = cp.spec, g = cp.pinion;
  const pitch = (2 * Math.PI) / zc;
  const arc = (r: number, a0: number, a1: number, n = 6): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [r, a0 + ((a1 - a0) * i) / n]);
  const ids: string[] = [];
  const half = Math.floor(teeth / 2);
  for (let j = -half; j <= half; j++) {
    const c = turn + j * pitch;
    const secs: string[][] = [];
    for (const y of [-g.hF, 0, g.hK + 0.5]) {
      const [al0, al1] = [flankAngle(cp, y, rIn), flankAngle(cp, y, rOut)];
      // counter-clockwise: the left flank out, the outer arc, the right flank in, the inner arc back (the angle grows to the right: towards +x)
      const pts: [number, number][] = [[rIn, c - al0], [rOut, c - al1], ...arc(rOut, c - al1, c + al1).slice(1, -1), [rOut, c + al1], [rIn, c + al0], ...arc(rIn, c + al0, c - al0).slice(1, -1)];
      const w = section(s, y, pts); s = w.s; secs.push(w.lines);
    }
    const id = nextId(scene(s), "s");
    s = run(s, { type: "addStep", step: { id, type: "loft", parts: secs[0] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), ruled: 1, mode: "new" } } } as never);
    if (s.message) throw new Error(`crown tooth ${j}: ${s.message}`);
    ids.push(id);
  }
  // the plate: a sector over the teeth, from the root plane up
  const yP = g.hK, span = (half + 0.7) * pitch;
  const plate: [number, number][] = [...arc(rOut + 0.0, turn - span, turn + span, 24), ...arc(rIn, turn + span, turn - span, 24)];
  const w = section(s, yP, plate); s = w.s;
  const pid = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: pid, type: "extrude", parts: w.lines as never, params: { depth: 3, mode: "new" } } } as never);
  if (s.message) throw new Error(`crown plate: ${s.message}`);
  ids.push(pid);
  const cid = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: cid, type: "combine", parts: ids.map((q) => `b/x_${q}/o`) as never, params: { mode: "add" } } } as never);
  if (s.message) throw new Error(`crown teeth and plate: ${s.message}`);
  return s;
}
/** the pinion: the loft of its flank sections between the planes the cones need, cut to the blank (the cones moved by `dx` along the axis: see `cones.ts` of the spiral bevel prototype) */
export function pinionBody(s: Session, cp: CrownPair, turn: number, N: number): Session {
  const g = cp.pinion, { rIn, rOut, module: m } = cp.spec;
  const dx = Number(process.env.CONE_DX ?? -0.67 * m);
  const bl = blankFor(g, rIn, rOut, m, 0);
  if (typeof bl === "string") throw new Error(`pinion: ${bl}`);
  const [A, B] = [pinionGrid(cp, 1), pinionGrid(cp, -1)];
  const u: V3 = [1, 0, 0], v = cross3(g.axis, u);
  const secs: string[][] = [];
  for (let i = 0; i < N; i++) {
    const X = bl.xS + ((bl.xB - bl.xS) * i) / (N - 1);
    const o = outlineAt(g, "pinion", contourAt(A, g.axis, X), contourAt(B, g.axis, X), X);
    if (!o) throw new Error(`pinion: no outline at X ${X.toFixed(1)}`);
    const at: V3 = [g.axis[0] * X, g.axis[1] * X, g.axis[2] * X];
    const ref = drawnRef(nextId(scene(s), "p"));
    s = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at, u, v } } as never);
    const pts = o.map(([r, f]): V3 => [at[0] + r * Math.cos(f + turn) * u[0] + r * Math.sin(f + turn) * v[0], at[1] + r * Math.cos(f + turn) * u[1] + r * Math.sin(f + turn) * v[1], at[2] + r * Math.cos(f + turn) * u[2] + r * Math.sin(f + turn) * v[2]]);
    const ch = drawChain(scene(s), ref as never, pts, true);
    s = run(s, ch.command);
    secs.push(ch.lines as string[]);
  }
  const loftId = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: loftId, type: "loft", parts: secs[0] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), mode: "new" } } } as never);
  if (s.message) throw new Error(`pinion: ${s.message}`);
  const bl2 = blankFor(g, rIn, rOut, m, dx);
  if (typeof bl2 === "string") throw new Error(`pinion: ${bl2}`);
  const bp = drawnRef(nextId(scene(s), "p"));
  s = run(s, { type: "addPart", part: { ref: bp, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, 0, 0], u, v: g.axis } } as never);
  let poly = bl2.polygon.map(([x, r]): [number, number] => [r, x]);
  const area = poly.reduce((acc, p, i) => { const q = poly[(i + 1) % poly.length]!; return acc + (p[0] * q[1] - q[0] * p[1]); }, 0);
  if (area < 0) poly = poly.slice().reverse();
  const ch = drawChain(scene(s), bp as never, poly.map(([r, x]): V3 => [u[0] * r + g.axis[0] * x, u[1] * r + g.axis[1] * x, u[2] * r + g.axis[2] * x]), true);
  s = run(s, ch.command);
  const revId = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: revId, type: "revolve", parts: ch.lines as never, params: { angle: 360, advance: 0, ax: 0, ay: 0, az: 0, dx: g.axis[0], dy: g.axis[1], dz: g.axis[2], mode: "new" } } } as never);
  if (s.message) throw new Error(`pinion blank: ${s.message}`);
  const comId = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: comId, type: "combine", parts: [`b/x_${loftId}/o`, `b/x_${revId}/o`] as never, params: { mode: "intersect" } } } as never);
  if (s.message) throw new Error(`pinion cone ends: ${s.message}`);
  return s;
}
export function overlap(cp: CrownPair, turnPinion: number, turnCrown: number, N = 9): { vol: number; none: boolean; vols: number[] } {
  let s = createSession(kernel);
  s = pinionBody(s, cp, turnPinion, N);
  s = crownBody(s, cp, 5, turnCrown);
  const b = bodies(s);
  assert.equal(b.length, 2, `two bodies, got ${b.length}`);
  const vols = b.map((x) => Math.round(x.volume));
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect" } } } as never);
  if (/nothing in common/.test(done.message ?? "")) return { vol: 0, none: true, vols };
  return { vol: bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0, none: false, vols };
}
export type { CrownSpec };
