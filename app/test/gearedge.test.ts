// The edge chamfer (`in_866`): the whole top and bottom perimeter of a spur gear or a ring chamfered, by a ruled loft through the outline inset at each face and the full one a chamfer in (`prototypes/perimeter-chamfer`).
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline, edgeOutlines } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const make = (spec: GearSpec): Session => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { volume: number; bbox: { min: Vec3; max: Vec3 } }[];
const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };

test("the inset outline is the same gear with its tip and root circles c in and thinner teeth, with the same number of sides; for a ring the circles move out", () => {
  const e = edgeOutlines({ teeth: 20, module: 2, width: 8, bore: 5, edge: 0.4 })!;
  assert.equal(e.full.points.length, e.inset.points.length);
  assert.ok(Math.abs(e.full.tipRadius - e.inset.tipRadius - 0.4) < 1e-9 && Math.abs(e.full.rootRadius - e.inset.rootRadius - 0.4) < 1e-9);
  const r = edgeOutlines({ teeth: 40, module: 2, width: 8, internal: true, edge: 0.4 })!;
  assert.equal(r.full.points.length, r.inset.points.length);
  assert.ok(Math.abs(r.inset.tipRadius - r.full.tipRadius - 0.4) < 1e-9 && Math.abs(r.inset.rootRadius - r.full.rootRadius - 0.4) < 1e-9);
  assert.equal(r.inset.outerRadius, r.full.outerRadius, "the wall is where it was");
  assert.equal(edgeOutlines({ teeth: 20, module: 2, width: 8 }), null);
  assert.equal(edgeOutlines({ teeth: 20, module: 2, edge: 0.4 }), null, "no thickness");
});

test("numbers that make no edge chamfer are refused with the reason", () => {
  const spur: GearSpec = { teeth: 20, module: 2, width: 8, edge: 0.4 };
  assert.equal(err(spur), "");
  assert.match(err({ ...spur, edge: 5 }), /from 0 to 3 mm/);
  assert.match(err({ ...spur, width: undefined }), /needs a thickness/);
  assert.match(err({ ...spur, helix: 15 }), /not made for a helical gear/);
  assert.match(err({ ...spur, bore: 6, flat: 1 }), /flat or a keyway/);
  assert.match(err({ ...spur, fillet: 0.2 }), /root fillet/);
  assert.match(err({ ...spur, width: 0.6, edge: 0.4 }), /half the thickness/);
  assert.match(err({ ...spur, teeth: 6, module: 2, edge: 1.5 }), /too big for these teeth|needs/, "teeth too thin for the inset");
});

test("a spur gear with an edge chamfer is one body made by one step, the same box, less material than the plain gear, in step with the kernel's own chamfer of all the edges of both faces; one undo-able record, and taking it off puts the extrusion back", () => {
  const spec: GearSpec = { teeth: 20, module: 2, bore: 5, width: 8 };
  const [plain, cut] = [make(spec), make({ ...spec, edge: 0.4 })];
  assert.ok(!cut.message, cut.message ?? "");
  assert.deepEqual(cut.outcome.errors, {});
  assert.deepEqual(scene(cut).steps.map((x) => x.type), ["chamferBody"]);
  assert.equal(bodies(cut).length, 1);
  const [a, b] = [bodies(plain)[0]!, bodies(cut)[0]!];
  // the prototype measured the kernel's chamfer of both faces' edges at 0.4 mm on this gear: 9608.1 mm3 (the plain gear 9651.7)
  assert.ok(Math.abs(b.volume - 9608.1) < 3, `volume ${b.volume} against the kernel's chamfer 9608.1 (plain ${a.volume})`);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a.bbox.min[i]! - b.bbox.min[i]!) < 0.02 && Math.abs(a.bbox.max[i]! - b.bbox.max[i]!) < 0.02, `the same box, axis ${i}`);
  const back = run(cut, { type: "setGear", id: "g_001", spec });
  assert.deepEqual(scene(back).steps.map((x) => x.type), ["extrude"]);
  assert.ok(Math.abs(bodies(back)[0]!.volume - a.volume) < 1e-6);
});

test("a ring with an edge chamfer: one body, less material, the wall chamfered too; with the tooth chamfer as well; moved to another place and plane", () => {
  const spec: GearSpec = { teeth: 40, module: 2, internal: true, width: 8 };
  const [plain, cut] = [make(spec), make({ ...spec, edge: 0.4 })];
  assert.deepEqual(cut.outcome.errors, {});
  assert.equal(bodies(cut).length, 1);
  assert.ok(bodies(cut)[0]!.volume < bodies(plain)[0]!.volume - 50 && bodies(cut)[0]!.volume > bodies(plain)[0]!.volume - 200, `${bodies(cut)[0]!.volume} against ${bodies(plain)[0]!.volume}`);
  const both = make({ teeth: 20, module: 2, bore: 5, width: 8, edge: 0.4, chamfer: 0.3 });
  assert.deepEqual(both.outcome.errors, {});
  assert.deepEqual(scene(both).steps.map((x) => x.type), ["chamferBody", "toothChamfer"]);
  assert.equal(bodies(both).length, 1);
  const moved = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XZ"), at: [10, 20, 30], spec: { teeth: 20, module: 2, bore: 5, width: 8, edge: 0.4 }, turn: 0.3 });
  assert.deepEqual(moved.outcome.errors, {});
  assert.ok(Math.abs(bodies(moved)[0]!.volume - 9608.1) < 3, `${bodies(moved)[0]!.volume}`);
});
