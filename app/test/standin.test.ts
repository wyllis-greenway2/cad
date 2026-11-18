// The stand-in for a gear's body that the kernel has not made yet (`dec_gear_standin`, `in_707`): which steps get a disc, and its size and place.
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
import { standIns, STANDIN_MS, standInWords } from "../src/interaction/standin.ts";
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

test("a helical gear's twist step is drawn as a disc as wide as the gear; a worm is drawn as one disc as long as the worm", () => {
  const helical = standIns(scene(made({ teeth: 20, module: 2, helix: 15, width: 12 })), waiting);
  assert.equal(helical.length, 1);
  assert.ok(Math.abs(Math.abs(helical[0]!.depth) - 12) < 1e-9);
  const worm = standIns(scene(made({ teeth: 2, module: 2, worm: { diameter: 24, length: 30 } })), waiting);
  assert.equal(worm.length, 1, "one disc for two threads");
  assert.ok(Math.abs(worm[0]!.depth - 30) < 1e-9);
  assert.ok(Math.abs(worm[0]!.radius - 14) < 1e-9, "the thread's tip: pitch radius 12 plus a module");
  assert.ok(Math.abs(worm[0]!.centre[0]! - (5 - 15)) < 1e-9 && Math.abs(worm[0]!.normal[0]! - 1) < 1e-9, "from one end, along the axis");
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

test("the label on a disc says it is being made, and for how long once that is more than a moment", () => {
  assert.equal(standInWords(0), "Building…");
  assert.equal(standInWords(1), "Building…");
  assert.equal(standInWords(2), "Building… 2 s");
  assert.equal(standInWords(37), "Building… 37 s");
});

test("a sweep the kernel has not made yet is a tube along its path, as thick as the shape", async () => {
  const { drawRectangle, drawChain, drawArc } = await import("../src/operation/build.ts");
  const [XY, XZ] = [worldRef("XY"), worldRef("XZ")];
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const straight = drawChain(scene(s), XZ, [[0, 0, 0], [0, 0, 20]]);
  s = run(s, straight.command);
  const st = startOp(scene(s), [loopFaceRef(r.lines), ...straight.lines] as never, "sweep");
  assert.ok(st.ok);
  const done = runOp(s, (st as { op: Op }).op)!.session;
  const d = standIns(scene(done), waiting);
  assert.equal(d.length, 1);
  assert.ok(d[0]!.path && d[0]!.path.length === 2, "a straight path is its two ends");
  assert.ok(Math.abs(d[0]!.radius - 4 / Math.sqrt(Math.PI)) < 1e-9, "a 4 x 4 square: the circle of the same area, 4 / sqrt(pi)");
  assert.deepEqual(standIns(scene(done), { stale: true, ops: [{ id: `x_${scene(done).steps.at(-1)!.id}` }] }), [], "none once the kernel has made it");
  // an arc: points on the circle of the arc
  s = createSession(kernel);
  const r2 = drawRectangle(scene(s), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r2.command);
  const a = drawArc(scene(s), XZ, [0, 0, 0], [20 - 20 * Math.SQRT1_2, 0, 20 * Math.SQRT1_2], [20, 0, 20], [0, -1, 0])!;
  s = run(s, a.command);
  const st2 = startOp(scene(s), [loopFaceRef(r2.lines), a.line] as never, "sweep");
  assert.ok(st2.ok);
  const bent = standIns(scene(runOp(s, (st2 as { op: Op }).op)!.session), waiting)[0]!;
  assert.equal(bent.path!.length, 9, "two ends and seven between, eight pieces: 1 + 7 + 1");
  for (const q of bent.path!) assert.ok(Math.abs(Math.hypot(q[0]! - 20, q[2]!) - 20) < 1e-6, "on the circle of radius 20");
});
