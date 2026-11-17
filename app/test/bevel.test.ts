// Straight bevel gears (`dec_bevel_gears`, `in_735`): an approximation of the standard tooth, made as a ruled loft of two sections.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { bevelOf, pitchAngle } from "../src/operation/bevel.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const pinion: GearSpec = { teeth: 20, module: 2, bevel: { mate: 30 } };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];
const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };

test("the numbers of a bevel gear: pitch angles add to the shaft angle, the cone distance and the KHK proportions", () => {
  const [a, b] = [pitchAngle(20, 30, 90), pitchAngle(30, 20, 90)];
  assert.ok(Math.abs(a + b - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(Math.tan(a) - 20 / 30) < 1e-12, "tan delta = z1 / z2 at 90 degrees");
  const g = bevelOf(pinion);
  assert.ok(g.ok);
  const v = (g as { value: ReturnType<typeof bevelOf> extends infer T ? T extends { ok: true; value: infer V } ? V : never : never }).value;
  assert.ok(Math.abs(v.R - (2 * 20) / (2 * Math.sin(a))) < 1e-9);
  assert.ok(Math.abs(v.addendum + v.dedendum - 2.188 * 2) < 1e-9, "whole depth 2.188 m");
  assert.ok(Math.abs(v.face - v.R / 3) < 1e-9, "the face is a third of the cone distance");
  const mate = bevelOf({ teeth: 30, module: 2, bevel: { mate: 20 } });
  assert.ok(mate.ok && Math.abs((mate as { value: { addendum: number } }).value.addendum + v.addendum - 4) < 1e-9, "the addenda of the pair add to 2 m (long and short addendum)");
});

test("refusals say why", () => {
  assert.match(err({ ...pinion, teeth: 4 }), /6 to 200 teeth/);
  assert.match(err({ ...pinion, bevel: { mate: 3 } }), /meshes with needs/);
  assert.match(err({ ...pinion, bevel: { mate: 30, shaft: 10 } }), /shafts must be/);
  assert.match(err({ ...pinion, bevel: { mate: 30, face: 0.9 } }), /face width/);
  assert.equal(err(pinion), "");
  const o = gearOutline(pinion);
  assert.ok(o.ok && o.value.warnings.some((w) => /approximation/.test(w)), "the outline says it is an approximation");
});

test("the gear command makes a bevel gear: one body, a ruled loft of two sections, and a bore through it", () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...pinion, bore: 5 } });
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(scene(s).steps.map((x) => x.type), ["loft"]);
  assert.equal(scene(s).steps[0]!.params.ruled, 1);
  assert.deepEqual(s.outcome.errors, {});
  const b = bodies(s);
  assert.equal(b.length, 1);
  const g = bevelOf(pinion);
  assert.ok(g.ok);
  const { pitchRadius, face, k } = (g as { value: { pitchRadius: number; face: number; k: number } }).value;
  // a frustum of the pitch circle's size: between the cones of the root and the tip radii
  const frustum = (r: number) => (Math.PI * ((r ** 2) * (1 + k + k * k)) * (face * Math.cos(Math.atan(20 / 30)))) / 3;
  assert.ok(b[0]!.volume > 0.5 * frustum(pitchRadius) && b[0]!.volume < frustum(pitchRadius) * 1.1, `${b[0]!.volume} vs ${frustum(pitchRadius)}`);
});

test("two bevel gears are two bodies, one for each gear", () => {
  // (how well a pair fits is measured in `prototypes/bevel-pair`; placing the mate at the shaft angle is not built yet: `q_bevel_gears`)
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: pinion });
  assert.ok(!s.message, s.message ?? "");
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: [0, 0, 40], spec: { teeth: 30, module: 2, bevel: { mate: 20 } } });
  assert.ok(!s.message, s.message ?? "");
  assert.equal(bodies(s).length, 2, "two bodies, one for each gear");
});
