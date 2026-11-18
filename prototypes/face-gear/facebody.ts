// The face gear and its spur pinion as bodies in the kernel, to measure the pair (`dec_crown_gear_set`, a prototype): the face gear a loft through sections at heights (tooth outlines from the envelope's flank curves) cut by a revolved blank and joined to a plate; the pinion a ruled loft of its involute outline.
import assert from "node:assert/strict";
import { facePair, faceGrid, contourAt, curveAt } from "./face.ts";
import type { FacePair, FaceSpec } from "./face.ts";
import { bulgeOf } from "../../app/src/operation/arcs.ts";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawChain } from "../../app/src/operation/build.ts";
import { nextId, figureParams } from "../../app/src/operation/scene.ts";
import { drawnRef } from "../../app/src/shared/ref.ts";

type V3 = [number, number, number];
export const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];
export const example = (over: Partial<FaceSpec> = {}): FacePair => facePair({ z1: 14, z2: 40, m: 2, alpha: (20 * Math.PI) / 180, bl: 0.05, rIn: 40, rOut: 46, ...over });
const INSET = 0.4;
function plane(s: Session, at: V3, u: V3, v: V3): { s: Session; ref: string } {
  const ref = drawnRef(nextId(scene(s), "p"));
  return { s: run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at, u, v } } as never), ref };
}
/** the face gear's tooth outlines at heights `hs` as corners (x, y) and the bulge of each side: two arcs to a flank, one across the tip, one across the slot at the inner end (the last height copies the one before it: the slot's walls stand straight down to the root) */
function outlines(pr: FacePair, hs: number[], turn: number): { pts: [number, number][]; bulges: number[] }[] {
  const { rIn, rOut, z2 } = pr.spec, pitch = (2 * Math.PI) / z2;
  const [A, B] = [faceGrid(pr, 1), faceGrid(pr, -1)];
  const NR = 8, ri = rIn - INSET;
  const radii = Array.from({ length: NR + 1 }, (_, i) => ri + ((rOut - ri) * i) / NR);
  const xy = (r: number, th: number): [number, number] => [r * Math.cos(th), r * Math.sin(th)];
  const out: { pts: [number, number][]; bulges: number[] }[] = [];
  let last: [number[], number[]] | null = null;
  for (const h of hs) {
    let fa = curveAt(contourAt(pr, A, h), radii), fb = curveAt(contourAt(pr, B, h), radii);
    if (!fa || !fb) { if (!last) throw new Error(`face gear: no flank curves at h ${h}`); [fa, fb] = last; }
    else last = [fa, fb];
    const pts: [number, number][] = [], bulges: number[] = [];
    const side = (a: [number, number], via: [number, number], b: [number, number]) => { pts.push(a); bulges.push(bulgeOf(a, via, b)); };
    for (let j = 0; j < z2; j++) {
      const [c0, c1] = [turn + j * pitch, turn + (j + 1) * pitch];
      const up = (i: number) => xy(radii[i]!, c0 + fa![i]!), down = (i: number) => xy(radii[i]!, c1 + fb![i]!);
      const nextUp0 = xy(radii[0]!, c1 + fa![0]!);
      side(up(0), up(2), up(4)); side(up(4), up(6), up(8));
      side(up(8), xy(rOut, (c0 + fa![NR]! + c1 + fb![NR]!) / 2), down(8)); // across the tip
      side(down(8), down(6), down(4)); side(down(4), down(2), down(0));
      side(down(0), xy(ri, c1 + (fb![0]! + fa![0]!) / 2), nextUp0); // across the slot at the inner end
    }
    out.push({ pts, bulges });
  }
  return out;
}
export function faceBody(s: Session, pr: FacePair, turn: number): Session {
  const { rIn, rOut, m } = pr.spec;
  const hs = [pr.hK, 1, 0, -1, -pr.hK, -(pr.hF + 0.3 * m)]; // (the tip, down through the pitch plane to the pinion's tip, then straight to a little under the root)
  const outs = outlines(pr, hs, turn);
  const secs: string[][] = [];
  const u: V3 = [1, 0, 0], v: V3 = [0, 1, 0];
  hs.forEach((h, q) => {
    const w = plane(s, [0, 0, h - pr.r1], u, v); s = w.s;
    const ch = drawChain(scene(s), w.ref as never, outs[q]!.pts.map(([x, y]): V3 => [x, y, h - pr.r1]), true, { bulges: outs[q]!.bulges });
    s = run(s, ch.command); secs.push(ch.lines as string[]);
  });
  const loft = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: loft, type: "loft", parts: secs[0] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), mode: "new" } } } as never);
  if (s.message) throw new Error(`face gear loft: ${s.message}`);
  // the blank: a ring from the inner radius out, a thin hub inside the roots, on a plane through the axis
  const bottom = -(pr.hF + 0.2 * m) - pr.r1, top = pr.hK + m - pr.r1, hub = -(pr.hF + 0.1 * m) - pr.r1;
  const poly: [number, number][] = [[0, bottom], [rOut + m, bottom], [rOut + m, top], [rIn, top], [rIn, hub], [0, hub]];
  const bp = plane(s, [0, 0, 0], [1, 0, 0], [0, 0, 1]); s = bp.s;
  const ch = drawChain(scene(s), bp.ref as never, poly.map(([r, z]): V3 => [r, 0, z]), true);
  s = run(s, ch.command);
  const rev = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: rev, type: "revolve", parts: ch.lines as never, params: { angle: 360, advance: 0, ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 1, mode: "new" } } } as never);
  if (s.message) throw new Error(`face gear blank: ${s.message}`);
  const com = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: com, type: "combine", parts: [`b/x_${loft}/o`, `b/x_${rev}/o`] as never, params: { mode: "intersect" } } } as never);
  if (s.message) throw new Error(`face gear cone cut: ${s.message}`);
  // the plate: a disc from 4 mm under the root up to the root, half a module wider than the teeth
  const thick = 2 * m, zTop = -(pr.hF) - pr.r1;
  const pp = plane(s, [0, 0, zTop - thick], u, v); s = pp.s;
  const cc = drawnRef(nextId(scene(s), "c"));
  s = run(s, { type: "addPart", part: { ref: cc, kind: "corner", origin: "drawn", plane: pp.ref, movable: true, at: [0, 0, zTop - thick] } } as never);
  const ck = drawnRef(nextId(scene(s), "k"));
  s = run(s, { type: "addPart", part: { ref: ck, kind: "circle", origin: "drawn", plane: pp.ref, movable: true, center: cc, radius: rOut + 0.5 * m } } as never);
  const ex = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: ex, type: "extrude", parts: [ck] as never, params: { depth: thick, mode: "new" } } } as never);
  if (s.message) throw new Error(`face gear plate: ${s.message}`);
  if (process.env.FG_DEBUG) console.log("BODIES", bodies(s).map((b) => b.ref + ":" + Math.round(b.volume)).join(" "), loft, ex);
  const add = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: add, type: "combine", parts: [`b/x_${loft}/o`, `b/x_${ex}/o`] as never, params: { mode: "add" } } } as never);
  if (s.message) throw new Error(`face gear join: ${s.message}`);
  return s;
}
/** the spur pinion: its involute outline in planes square to x, a ruled loft along x over the face of the gear; turned about x by `turn` */
export function pinionBody(s: Session, pr: FacePair, turn: number): Session {
  const { z1, alpha, rIn, rOut, m, bl } = pr.spec;
  const rb = pr.rb, root = pr.r1 - pr.hF, tip = pr.r1 + pr.hK;
  const inv = (a: number) => Math.tan(a) - a;
  const half = (rho: number) => (Math.PI * m / 2 - bl) / 2 / pr.r1 + inv(alpha) - inv(Math.acos(Math.min(1, rb / rho)));
  const pitch = (2 * Math.PI) / z1;
  const pts: [number, number][] = [];
  for (let k = 0; k < z1; k++) {
    const c = -Math.PI / 2 + turn + k * pitch;
    const lo = Math.max(rb, root), NFp = 8;
    const rhos = Array.from({ length: NFp + 1 }, (_, i) => lo + ((tip - lo) * i) / NFp);
    if (root < rb) pts.push([root, c - half(rb)]);
    for (const r of rhos) pts.push([r, c - half(r)]);
    for (const r of rhos.slice().reverse()) pts.push([r, c + half(r)]);
    if (root < rb) pts.push([root, c + half(rb)]);
    pts.push([root, c + pitch / 2]);
  }
  const secs: string[][] = [];
  for (const x of [rIn - 1, rOut + 1]) {
    const w = plane(s, [x, 0, 0], [0, 1, 0], [0, 0, 1]); s = w.s;
    const ch = drawChain(scene(s), w.ref as never, pts.map(([r, a]): V3 => [x, r * Math.cos(a), r * Math.sin(a)]), true);
    s = run(s, ch.command); secs.push(ch.lines as string[]);
  }
  const loft = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: loft, type: "loft", parts: secs[0] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), ruled: 1, mode: "new" } } } as never);
  if (s.message) throw new Error(`pinion: ${s.message}`);
  return s;
}
export function overlap(pr: FacePair, turnPinion: number, turnFace: number): { vol: number; none: boolean; vols: number[] } {
  let s = createSession(kernel);
  s = pinionBody(s, pr, turnPinion);
  s = faceBody(s, pr, turnFace);
  const b = bodies(s);
  assert.equal(b.length, 2, `two bodies, got ${b.length}`);
  const vols = b.map((x) => Math.round(x.volume));
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect" } } } as never);
  if (/nothing in common/.test(done.message ?? "")) return { vol: 0, none: true, vols };
  return { vol: bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0, none: false, vols };
}
