// (0.1 mm of backlash in every pair: with none the flanks touch along the line of contact and the kernel cannot tell touching from overlapping, it answers with a body of the pair unchanged)
// The spherical involute tooth: the property it is derived from, and whether a pair of such gears keeps fitting as it turns (the Tredgold tooth of `prototypes/bevel-pair` fits at one place only).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawChain } from "../../app/src/operation/build.ts";
import { nextId, figureParams } from "../../app/src/operation/scene.ts";
import { drawnRef } from "../../app/src/shared/ref.ts";
import { bevelOf, bevelSection, pitchAngle } from "../bevel-pair/bevel.ts";
import type { BevelSpec } from "../bevel-pair/bevel.ts";
import { involuteAzimuth, sphericalSection } from "./spherical.ts";

type V = [number, number, number];
const [add, scale, dot, cross, unit] = [(a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k], (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; }];

test("the spherical involute: the tangent of the curve has a constant component along the axis, sin of the base cone's angle (the great circle normal to it is tangent to the base circle)", () => {
  for (const [delta, alpha] of [[0.6, 0.349], [1.0, 0.349], [1.3, 0.262]] as const) {
    const gb = Math.asin(Math.sin(delta) * Math.cos(alpha));
    const P = (t: number): V => { const f = involuteAzimuth(t, gb); return [Math.sin(t) * Math.cos(f), Math.sin(t) * Math.sin(f), Math.cos(t)]; };
    for (const t of [gb + 0.05, delta, delta + 0.1, delta + 0.25]) {
      const h = 1e-5;
      const T = unit([0, 1, 2].map((k) => P(t + h)[k]! - P(t - h)[k]!) as V);
      assert.ok(Math.abs(Math.abs(T[2]) - Math.sin(gb)) < 2e-4, `delta ${delta} t ${t}: ${Math.abs(T[2])} against ${Math.sin(gb)}`);
    }
  }
});

function gearBody(s: Session, sp: BevelSpec, axis: V, toward: V, turn: number, section: (sp: BevelSpec, n: number, turn: number) => [number, number][]): Session {
  const b = bevelOf(sp);
  const e = unit(add(toward, scale(axis, -dot(toward, axis))));
  const v = cross(axis, e);
  const polar = section(sp, 6, turn);
  const secs: string[][] = [];
  for (const k of [1, (b.coneDistance - b.face) / b.coneDistance]) {
    const at = scale(axis, b.coneDistance * Math.cos(b.delta) * k);
    const ref = drawnRef(nextId(scene(s), "p"));
    s = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at, u: e, v } } as never);
    const pts = polar.map(([r, th]): V => add(at, add(scale(e, r * k * Math.cos(th)), scale(v, r * k * Math.sin(th)))));
    const ch = drawChain(scene(s), ref as never, pts, true);
    s = run(s, ch.command);
    secs.push(ch.lines as string[]);
  }
  const id = nextId(scene(s), "s");
  const done = run(s, { type: "addStep", step: { id, type: "loft", parts: secs[0] as never, params: { ...figureParams([{ outer: secs[0] as never, holes: [] }, { outer: secs[1] as never, holes: [] }]), ruled: 1, mode: "new" } } } as never);
  if (done.message) throw new Error(done.message);
  return done;
}
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];

/** the overlap of the pair (cubic mm) with the pinion turned by `eps` and the wheel by the angle that keeps them meshing */
function overlapAt(z1: number, z2: number, eps: number, extra: number, section: (sp: BevelSpec, n: number, turn: number) => [number, number][]): number {
  const [sp1, sp2]: [BevelSpec, BevelSpec] = [{ z: z1, mate: z2, module: 2, xt: -0.05 }, { z: z2, mate: z1, module: 2, xt: -0.05 }];
  const b1 = bevelOf(sp1);
  const a1: V = [1, 0, 0], a2: V = [0, 0, 1];
  const contact: V = [Math.cos(b1.delta), 0, Math.sin(b1.delta)];
  let s = createSession(kernel);
  s = gearBody(s, sp1, a1, contact, eps, section);
  s = gearBody(s, sp2, a2, contact, Math.PI / z2 - (eps * z1) / z2 + extra, section);
  const b = bodies(s);
  assert.equal(b.length, 2);
  console.log(`VOL ${eps} ${extra} ${b.map((x) => x.volume.toFixed(0)).join(' ')}`);
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect" } } } as never);
  if (/nothing in common/.test(done.message ?? "")) return 0;
  return bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
}

test("closing the backlash by a fixed angle at several places of the mesh: the same overlap at each if the tooth is conjugate (the Tredgold one is not)", async () => {
  await kernel.init();
  const rows: string[] = [];
  for (const eps of [0, 0.08, 0.16]) for (const extra of [0.04, -0.04]) {
    const [tr, sp] = [overlapAt(20, 30, eps, extra, bevelSection), overlapAt(20, 30, eps, extra, sphericalSection)];
    rows.push(`pinion turned ${eps}, wheel turned a further ${extra}: Tredgold ${tr.toFixed(1)} mm3, spherical involute ${sp.toFixed(1)} mm3`);
  }
  console.log("ROWS\n" + rows.join("\n"));
});
