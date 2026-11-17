// Builds a straight bevel pair from the prototype's tooth sections as ruled lofts in the app's kernel, and measures how they fit: each body's volume and how much the two overlap (the same check as the worm and its wheel).
import test from "node:test";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawChain } from "../../app/src/operation/build.ts";
import { nextId, figureParams } from "../../app/src/operation/scene.ts";
import { drawnRef } from "../../app/src/shared/ref.ts";
import { bevelOf, bevelSection, pitchAngle } from "./bevel.ts";
import type { BevelSpec } from "./bevel.ts";

type V = [number, number, number];
const [add, scale, dot, cross, unit] = [(a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k], (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; }];

function gearBody(s: Session, sp: BevelSpec, axis: V, toward: V, turn: number, slide = 0): Session {
  const b = bevelOf(sp);
  const e = unit(add(toward, scale(axis, -dot(toward, axis)))); // (the direction across the axis towards the mating gear: where the tooth, or the gap, is centred)
  const v = cross(axis, e);
  const polar = bevelSection(sp, 8, turn);
  const secs: string[][] = [];
  for (const k of [1, (b.coneDistance - b.face) / b.coneDistance]) {
    const at = scale(axis, b.coneDistance * Math.cos(b.delta) * k + slide);
    const ref = drawnRef(nextId(scene(s), "p"));
    s = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at, u: e, v } } as never);
    const pts = polar.map(([r, th]): V => add(at, add(scale(e, r * k * Math.cos(th)), scale(v, r * k * Math.sin(th)))));
    const ch = drawChain(scene(s), ref as never, pts, true);
    s = run(s, ch.command);
    secs.push(ch.lines as string[]);
  }
  // a ruled loft of the two sections, a piece of its own (`mode: "new"`), as the worm wheel's is
  const id = nextId(scene(s), "s");
  const done = run(s, { type: "addStep", step: { id, type: "loft", parts: secs[0] as never, params: { ...figureParams([{ outer: secs[0] as never, holes: [] }, { outer: secs[1] as never, holes: [] }]), ruled: 1, mode: "new" } } } as never);
  if (done.message) throw new Error(done.message);
  return done;
}

const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];

for (const [z1, z2, shaft] of [[20, 20, 90], [20, 30, 90], [24, 24, 60]] as const) {
  test(`a straight bevel pair ${z1}/${z2} teeth, module 2, shafts ${shaft} degrees`, async () => {
    await kernel.init();
    const [sp1, sp2]: [BevelSpec, BevelSpec] = [{ z: z1, mate: z2, module: 2, shaft }, { z: z2, mate: z1, module: 2, shaft }];
    const [b1, b2] = [bevelOf(sp1), bevelOf(sp2)];
    const sigma = (shaft * Math.PI) / 180;
    const a1: V = [1, 0, 0], a2: V = [Math.cos(sigma), 0, Math.sin(sigma)];
    const contact: V = [Math.cos(b1.delta), 0, Math.sin(b1.delta)];
    console.log(`PAIR ${z1}/${z2} shaft ${shaft}: delta ${(b1.delta * 180 / Math.PI).toFixed(3)} + ${(b2.delta * 180 / Math.PI).toFixed(3)} = ${((b1.delta + b2.delta) * 180 / Math.PI).toFixed(3)}, cone distances ${b1.coneDistance.toFixed(3)} ${b2.coneDistance.toFixed(3)}, face ${b1.face.toFixed(2)}, pitch angle check ${(pitchAngle(z1, z2, shaft) * 180 / Math.PI).toFixed(3)}`);
    for (const [name, turn2, slide2] of [["fits", Math.PI / z2, 0], ["tooth on tooth", 0, 0], ["0.3 mm closer", Math.PI / z2, -0.3], ["0.3 mm further", Math.PI / z2, 0.3]] as const) {
    let s = createSession(kernel);
    s = gearBody(s, sp1, a1, contact, 0);
    s = gearBody(s, sp2, a2, contact, turn2, slide2);
    console.log("BODIES", JSON.stringify(bodies(s).map((b) => Math.round(b.volume))), "errors", JSON.stringify(s.outcome.errors));
    const b = bodies(s);
    if (b.length === 2) {
      const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect", keep: 1 } } });
      const none = Object.values(done.outcome.errors).some((e) => /nothing in common/.test(e));
      const rest = bodies(done).map((x) => x.volume).sort((x, y) => y - x);
      console.log("AFTER", name, JSON.stringify(none ? "nothing in common" : rest.map((v) => Math.round(v * 100) / 100)), "of", Math.round(b[0]!.volume), Math.round(b[1]!.volume));
    }
    }
  });
}
