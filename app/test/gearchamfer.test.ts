// The tooth chamfer (`in_791`): the tips of the teeth broken at both faces by one turned cut, for a gear with a thickness (spur, helical, ring).
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline, chamferOf } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const make = (spec: GearSpec): Session => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { volume: number; bbox: { min: Vec3; max: Vec3 } }[];

test("a chamfer is its depth (modules x module), which way is out of the material and the thickness; none without a chamfer or a thickness, or for a rack", () => {
  assert.deepEqual(chamferOf({ teeth: 20, module: 2, width: 8, chamfer: 0.25 }), { depth: 0.5, side: 1, width: 8 });
  assert.deepEqual(chamferOf({ teeth: 40, module: 2, width: 8, chamfer: 0.25, internal: true }), { depth: 0.5, side: -1, width: 8 });
  assert.equal(chamferOf({ teeth: 20, module: 2, width: 8 }), null);
  assert.equal(chamferOf({ teeth: 20, module: 2, chamfer: 0.25 }), null);
  assert.equal(chamferOf({ teeth: 10, module: 2, width: 8, chamfer: 0.25, rack: true }), null);
});

test("numbers that make no chamfer are refused with the reason", () => {
  const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };
  assert.match(err({ teeth: 20, module: 2, chamfer: 0.3 }), /needs a thickness/);
  assert.match(err({ teeth: 20, module: 2, width: 8, chamfer: 1.5 }), /from 0 to 1 module/);
  assert.match(err({ teeth: 20, module: 2, width: 1, chamfer: 0.9 }), /half the thickness/);
  assert.equal(err({ teeth: 20, module: 2, width: 8, chamfer: 0.3 }), "");
});

test("a spur gear with a chamfer is one body with the same box and less material, made by an extrusion and a tooth chamfer step; the same for a helical gear and a ring", () => {
  for (const spec of [{ teeth: 20, module: 2, bore: 5, width: 8 }, { teeth: 20, module: 2, bore: 5, width: 8, helix: 15 }, { teeth: 40, module: 2, internal: true, width: 8 }] as GearSpec[]) {
    const [plain, cut] = [make(spec), make({ ...spec, chamfer: 0.3 })];
    assert.ok(!cut.message, cut.message ?? "");
    assert.deepEqual(cut.outcome.errors, {});
    assert.equal(bodies(cut).length, 1, "one body");
    const [a, b] = [bodies(plain)[0]!, bodies(cut)[0]!];
    assert.ok(b.volume < a.volume - 5, `${JSON.stringify(spec)}: ${b.volume} against ${a.volume}`);
    for (let i = 0; i < 3; i++) { assert.ok(Math.abs(a.bbox.min[i]! - b.bbox.min[i]!) < 0.02 && Math.abs(a.bbox.max[i]! - b.bbox.max[i]!) < 0.02, `the same box: ${JSON.stringify(spec)} axis ${i}: ${JSON.stringify(a.bbox)} against ${JSON.stringify(b.bbox)}`); }
    assert.deepEqual(scene(cut).steps.map((x) => x.type), [spec.helix ? "revolve" : "extrude", "toothChamfer"]);
  }
  // the chamfer follows the numbers: taking it off puts the steps and the material back
  const s = make({ teeth: 20, module: 2, bore: 5, width: 8, chamfer: 0.3 });
  const back = run(s, { type: "setGear", id: "g_001", spec: { teeth: 20, module: 2, bore: 5, width: 8 } });
  assert.equal(scene(back).steps.length, 1);
  assert.ok(Math.abs(bodies(back)[0]!.volume - bodies(make({ teeth: 20, module: 2, bore: 5, width: 8 }))[0]!.volume) < 1e-6);
});
