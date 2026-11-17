// The stand-in for a gear's body that the kernel has not made yet (`dec_gear_standin`, `in_695`): which steps get a disc, and its size and place.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { standIns, STANDIN_MS } from "../src/interaction/standin.ts";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const waiting = { stale: true, ops: [] as { id: string }[] };
const made = (spec: GearSpec, at: Vec3 = [5, 6, 0]) => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at, spec });
/** a plain gear with its body extruded by the push / pull step, as the person makes it */
const extruded = (spec: GearSpec, depth = 10) => {
  const s = made(spec);
  const face = loopFaceRef(gearRefs({ id: "g_001", plane: worldRef("XY"), at: [5, 6, 0], spec }).lines);
  return runOp(s, { ...(startOp(scene(s), [face as never], "extrude") as { op: Op }).op, value: depth })!.session;
};

test("a gear's extruded body that the kernel has not made yet gets a disc at the gear's outside diameter, on its plane, of the step's depth", () => {
  const spec: GearSpec = { teeth: 20, module: 2 };
  const s = extruded(spec, 10);
  const d = standIns(scene(s), waiting);
  assert.equal(d.length, 1);
  const o = gearOutline(spec);
  assert.ok(o.ok);
  assert.ok(Math.abs(d[0]!.radius - (o.value.outerRadius ?? o.value.tipRadius)) < 1e-9);
  assert.deepEqual(d[0]!.centre, [5, 6, 0]);
  assert.ok(Math.abs(d[0]!.normal[2]! - 1) < 1e-9);
  assert.ok(Math.abs(Math.abs(d[0]!.depth) - 10) < 1e-9);
  assert.equal(d[0]!.hole, 0);
});

test("no disc when the kernel is not working, or has made the step, or there is no gear", () => {
  const s = extruded({ teeth: 20, module: 2 });
  const step = scene(s).steps.at(-1)!;
  assert.deepEqual(standIns(scene(s), { stale: false, ops: [] }), []);
  assert.deepEqual(standIns(scene(s), null), []);
  assert.deepEqual(standIns(scene(s), { stale: true, ops: [{ id: `x_${step.id}` }] }), [], "a body already drawn is not replaced");
  assert.deepEqual(standIns(scene(createSession(kernel)), waiting), []);
});

test("a bore makes the disc a ring with a hole of the bore's radius; an internal gear is a ring too", () => {
  const bored = standIns(scene(extruded({ teeth: 20, module: 2, bore: 8 })), waiting);
  assert.equal(bored[0]!.hole, 4);
  const spec: GearSpec = { teeth: 40, module: 1, internal: true };
  const ring = standIns(scene(extruded(spec)), waiting);
  const o = gearOutline(spec);
  assert.ok(o.ok);
  assert.ok(ring[0]!.hole > 0 && ring[0]!.hole < ring[0]!.radius);
  assert.ok(Math.abs(ring[0]!.hole - o.value.tipRadius) < 1e-9);
});

test("a helical gear's twist step is drawn as a disc as wide as the gear; a worm is not drawn", () => {
  const helical = standIns(scene(made({ teeth: 20, module: 2, helix: 15, width: 12 })), waiting);
  assert.equal(helical.length, 1);
  assert.ok(Math.abs(Math.abs(helical[0]!.depth) - 12) < 1e-9);
  assert.deepEqual(standIns(scene(made({ teeth: 1, module: 2, worm: { diameter: 24, length: 30 } })), waiting), []);
});

test("a worm wheel's disc is centred on its plane (its sections lie either side)", () => {
  const d = standIns(scene(made({ teeth: 24, module: 2, wheel: { diameter: 24, starts: 1, width: 10 } })), waiting);
  assert.equal(d.length, 1);
  assert.ok(Math.abs(d[0]!.depth - 10) < 1e-9);
  assert.ok(Math.abs(d[0]!.centre[2] + 5) < 1e-9, `${d[0]!.centre}`);
  assert.ok(d[0]!.radius > 20 && d[0]!.radius < 30, `${d[0]!.radius}`);
});

test("the wait before a disc is drawn is short but not a flash", () => {
  assert.ok(STANDIN_MS >= 100 && STANDIN_MS <= 500);
});
