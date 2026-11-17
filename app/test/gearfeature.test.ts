// A gear as one feature (`dec_gear_feature`, `in_696`): the body of a gear has only the parts a person picks, not a face and edges for every arc of every tooth.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { bodyParts } from "../src/compiler/body.ts";
import { gearShapes } from "../src/operation/gearshape.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const made = (spec: GearSpec) => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
const extruded = (spec: GearSpec, depth = 10): Session => {
  const s = made(spec);
  const face = spec.internal ? (Object.values(scene(s).parts).find((p) => p.kind === "face" && p.disk)!.ref) : loopFaceRef(gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines);
  return runOp(s, { ...(startOp(scene(s), [face as never], "extrude") as { op: Op }).op, value: depth })!.session;
};
const ofBody = (s: Session): Part[] => Object.values(scene(s).parts).filter((p) => p.origin === "body");
const count = (parts: Part[], kind: string) => parts.filter((p) => p.kind === kind).length;

test("a spur gear with a bore has its body, its two faces, its bore (a round face and its two rim halves) and nothing of its teeth", () => {
  const s = extruded({ teeth: 40, module: 2, bore: 8 });
  const parts = ofBody(s);
  assert.equal(count(parts, "body"), 1);
  const planes = parts.filter((p) => p.kind === "plane");
  const flat = planes.filter((p) => !(p as { curved?: unknown }).curved);
  assert.deepEqual(flat.map((p) => (p as { ref: string }).ref).sort(), ["b/body/f@0,0,-1,0", "b/body/f@0,0,1,10"], "its two faces, across the axis");
  const round = planes.filter((p) => (p as { curved?: unknown }).curved) as unknown as { curved: { radius: number; convex: boolean } }[];
  assert.equal(round.length, 1);
  assert.equal(round[0]!.curved.radius, 4, "the bore");
  assert.ok(count(parts, "line") <= 2 && count(parts, "corner") <= 2, `${count(parts, "line")} lines, ${count(parts, "corner")} corners`);
  assert.ok(parts.length <= 8, `${parts.length} parts of the body (it was 2900)`);
});

test("an internal gear keeps its two faces and the round wall outside it", () => {
  const parts = ofBody(extruded({ teeth: 40, module: 2, internal: true }));
  const round = parts.filter((p) => p.kind === "plane" && (p as { curved?: unknown }).curved) as unknown as { curved: { radius: number } }[];
  assert.equal(round.length, 1);
  assert.ok(round[0]!.curved.radius > 40, `${round[0]!.curved.radius}`);
  assert.ok(parts.length <= 8, `${parts.length}`);
});

test("a helical gear and a worm wheel are one feature too", () => {
  const helical = ofBody(made({ teeth: 24, module: 2, helix: 15, width: 12, bore: 6 }));
  assert.ok(helical.length > 0 && helical.length <= 8, `helical: ${helical.length} parts`);
  assert.equal(helical.filter((p) => p.kind === "plane" && !(p as { curved?: unknown }).curved).length, 2);
  const wheel = ofBody(made({ teeth: 24, module: 2, bore: 8, wheel: { diameter: 24, starts: 1, width: 10 } }));
  assert.ok(wheel.length > 0 && wheel.length <= 8, `wheel: ${wheel.length} parts`);
  assert.equal(wheel.filter((p) => p.kind === "plane" && !(p as { curved?: unknown }).curved).length, 2);
});

test("a body that is not wholly a gear keeps every part (a gear that has been moved off its record, or joined to something)", () => {
  const s = extruded({ teeth: 40, module: 2, bore: 8 });
  const k = s.outcome.kernel!;
  const shapes = gearShapes(scene(s));
  assert.equal(shapes.length, 1);
  const full = bodyParts(k, [], []);
  const reduced = bodyParts(k, [], shapes);
  assert.ok(full.length > 2000 && reduced.length < 20, `${full.length} against ${reduced.length}`);
  const away = bodyParts(k, [], shapes.map((g) => ({ ...g, centre: [g.centre[0] + 50, g.centre[1], g.centre[2]] as typeof g.centre })));
  assert.equal(away.length, full.length, "a gear that is not where its record says is not cut down");
  const small = bodyParts(k, [], shapes.map((g) => ({ ...g, radius: g.radius / 2 })));
  assert.equal(small.length, full.length, "a body bigger than the gear (something joined to it) is not cut down");
});

test("a gear of a hundred teeth has a few dozen parts in all, not tens of thousands", () => {
  const s = extruded({ teeth: 100, module: 1 });
  assert.ok(ofBody(s).length <= 8, `${ofBody(s).length}`);
});
