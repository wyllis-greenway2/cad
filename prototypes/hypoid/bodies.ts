// The hypoid pair's gears in the kernel (as `bevel-spiral-generated/cones.ts` makes the spiral bevel pair's): each is a loft through the tooth outlines in planes across its axis, intersected with a revolved blank of the two back cones.
// The ring's axis does not pass through the origin (the offset), so a gear's planes and its blank are about its own axis point.
import assert from "node:assert/strict";
import { flankGrid, contourAt, outlineAt, blankFor, SPIRAL } from "./hypoid.ts";
import type { SpiralPair } from "./hypoid.ts";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawChain } from "../../app/src/operation/build.ts";
import { nextId, figureParams } from "../../app/src/operation/scene.ts";
import { drawnRef } from "../../app/src/shared/ref.ts";

type V3 = [number, number, number];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];

export function gearBody(s: Session, pr: SpiralPair, which: "pinion" | "ring", turn: number, N: number): Session {
  const g = which === "pinion" ? pr.pinion : pr.ring;
  const m = pr.mn;
  const u: V3 = [1, 0, 0], v = cross3(g.axis, u), o = g.origin;
  const add = (X: number, r: number, f: number): V3 => [o[0] + g.axis[0] * X + r * (Math.cos(f) * u[0] + Math.sin(f) * v[0]), o[1] + g.axis[1] * X + r * (Math.cos(f) * u[1] + Math.sin(f) * v[1]), o[2] + g.axis[2] * X + r * (Math.cos(f) * u[2] + Math.sin(f) * v[2])];
  let last = "";
  for (const sh of SPIRAL.shifts) {
    const bl = blankFor(g, g.rho - pr.b / 2, g.rho + pr.b / 2, m, sh * m);
    if (typeof bl === "string") throw new Error(`${which}: ${bl}`);
    const [A, B] = [flankGrid(pr, which, "A"), flankGrid(pr, which, "B")];
    let t = s;
    const secs: string[][] = [];
    for (let i = 0; i < N; i++) {
      const X = bl.xS + ((bl.xB - bl.xS) * i) / (N - 1);
      const oo = outlineAt(g, which, contourAt(A, g.axis, X, o), contourAt(B, g.axis, X, o), X);
      if (!oo) throw new Error(`${which}: no outline at X ${X.toFixed(1)}`);
      const at = add(X, 0, 0);
      const ref = drawnRef(nextId(scene(t), "p"));
      t = run(t, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at, u, v } } as never);
      const ch = drawChain(scene(t), ref as never, oo.map(([r, f]) => add(X, r, f + turn)), true);
      t = run(t, ch.command);
      secs.push(ch.lines as string[]);
    }
    const loftId = nextId(scene(t), "s");
    t = run(t, { type: "addStep", step: { id: loftId, type: "loft", parts: secs[0] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), mode: "new" } } } as never);
    if (t.message) throw new Error(`${which}: ${t.message}`);
    const bp = drawnRef(nextId(scene(t), "p"));
    t = run(t, { type: "addPart", part: { ref: bp, kind: "plane", origin: "drawn", plane: null, movable: true, at: o, u, v: g.axis } } as never);
    let poly = bl.polygon.map(([x, r]): [number, number] => [r, x]);
    const area = poly.reduce((acc, p, i) => { const q = poly[(i + 1) % poly.length]!; return acc + (p[0] * q[1] - q[0] * p[1]); }, 0);
    if (area < 0) poly = poly.slice().reverse();
    const ch = drawChain(scene(t), bp as never, poly.map(([r, x]) => add(x, r, 0)), true);
    t = run(t, ch.command);
    const revId = nextId(scene(t), "s");
    t = run(t, { type: "addStep", step: { id: revId, type: "revolve", parts: ch.lines as never, params: { angle: 360, advance: 0, ax: o[0], ay: o[1], az: o[2], dx: g.axis[0], dy: g.axis[1], dz: g.axis[2], mode: "new" } } } as never);
    if (t.message) { last = `${which} blank: ${t.message}`; continue; }
    const comId = nextId(scene(t), "s");
    t = run(t, { type: "addStep", step: { id: comId, type: "combine", parts: [`b/x_${loftId}/o`, `b/x_${revId}/o`] as never, params: { mode: "intersect" } } } as never);
    if (t.message) { last = `${which} cone ends (shift ${sh}): ${t.message}`; continue; }
    return t;
  }
  throw new Error(last);
}
export function overlap(pr: SpiralPair, turnPinion: number, turnRing: number, N = 7): { vol: number; none: boolean; vols: number[] } {
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
