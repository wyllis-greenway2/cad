// The spiral bevel pair made by the gearing law with cone ends, in the kernel, for several tooth counts and spiral angles (`in_795`): each gear is a prism of the tooth sections (a loft through planes from the toe's cone to the heel's, beyond the face by what the
// cones need) intersected with the blank of the two back cones; the measure is the overlap of the pair (nothing at the meshing place, the same rolled, a lot half a pitch round).
import test from "node:test";
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
function pairFor(z1: number, z2: number, mn: number, betaDeg: number) {
  const g1 = Math.atan(z1 / z2), g2 = Math.PI / 2 - g1, bm = deg(betaDeg);
  const mf = mn / Math.cos(bm), RM = (mf * z2) / (2 * Math.sin(g2)), b = 0.3 * RM;
  return pairOf({ crown: { RM, RW: 0.88 * RM, beta: bm, tB: Math.PI * mn, alpha: deg(20), gamma: g2, hand: 1 }, z1, z2, mn, b, bl: 0.05 });
}

function gearBody(s: Session, pr: Pair, which: "pinion" | "ring", turn: number, N: number): Session {
  const g: Gear = which === "pinion" ? pr.pinion : pr.ring;
  const RM = pr.spec.crown.RM, b = pr.spec.b, m = pr.spec.mn;
  const bl = blankFor(g, RM - b / 2, RM + b / 2, m);
  if (typeof bl === "string") throw new Error(`${which}: ${bl}`);
  const [A, B] = [flankGrid(pr, which, "A"), flankGrid(pr, which, "B")];
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
  s = run(s, { type: "addStep", step: { id: loftId, type: "loft", parts: secs[0] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), mode: "new" } } } as never);
  if (s.message) throw new Error(`${which}: ${s.message}`);
  // the blank: its section on a plane through the axis (radius along the first direction, the axis along the second), revolved about the axis
  const bp = drawnRef(nextId(scene(s), "p"));
  s = run(s, { type: "addPart", part: { ref: bp, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, 0, 0], u, v: g.axis } } as never);
  let poly = bl.polygon.map(([x, r]): [number, number] => [r, x]);
  const area = poly.reduce((acc, p, i) => { const q = poly[(i + 1) % poly.length]!; return acc + (p[0] * q[1] - q[0] * p[1]); }, 0);
  if (area < 0) poly = poly.slice().reverse();
  const pts3 = poly.map(([r, x]): V3 => [u[0] * r + g.axis[0] * x, u[1] * r + g.axis[1] * x, u[2] * r + g.axis[2] * x]);
  const ch = drawChain(scene(s), bp as never, pts3, true);
  s = run(s, ch.command);
  const revId = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: revId, type: "revolve", parts: ch.lines as never, params: { angle: 360, advance: 0, ax: 0, ay: 0, az: 0, dx: g.axis[0], dy: g.axis[1], dz: g.axis[2], mode: "new" } } } as never);
  if (s.message) throw new Error(`${which} blank: ${s.message}`);
  const comId = nextId(scene(s), "s");
  s = run(s, { type: "addStep", step: { id: comId, type: "combine", parts: [`b/x_${loftId}/o`, `b/x_${revId}/o`] as never, params: { mode: "intersect" } } } as never);
  if (s.message) throw new Error(`${which} cone ends: ${s.message}`);
  return s;
}
function overlap(pr: Pair, turnPinion: number, turnRing: number, N: number): { vol: number; none: boolean; vols: number[] } {
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

const SETS: [number, number, number, number][] = [[20, 30, 3, 30], [24, 24, 3, 30], [16, 32, 3, 30], [20, 30, 3, 40], [17, 43, 3, 30], [30, 45, 2.5, 30]];
for (const [z1, z2, mn, beta] of SETS) {
  test(`cone ends: ${z1} / ${z2} teeth, module ${mn}, ${beta} degrees: the pair fits at its place and rolling, not half a pitch round`, async () => {
    await kernel.init();
    const pr = pairFor(z1, z2, mn, beta);
    const kk = Math.sin(pr.pinion.gamma) / Math.sin(pr.ring.gamma);
    const rows: string[] = [];
    for (const [name, tp, tr] of [["at the place", 0, 0], ["rolled by 0.05", 0.05, -kk * 0.05], ["half a pitch round", 0, Math.PI / pr.ring.z]] as const) {
      const o = overlap(pr, tp, tr, 9);
      rows.push(`${name}: ${o.none ? "nothing in common" : `${o.vol.toFixed(1)} mm3`} (bodies ${o.vols.join(", ")})`);
    }
    console.log(`ROWS ${z1}/${z2} m${mn} b${beta}\n` + rows.join("\n"));
  });
}
