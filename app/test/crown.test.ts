// Crown gears (`dec_crown_gears`, `in_802`): a bevel gear whose pitch angle is a right angle, made as a toothed loft cut to a blank, joined to a plate; a straight bevel pinion meshes with it.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { isCrown } from "../src/operation/bevel.ts";
import { crownShaft } from "../src/operation/crown.ts";
import { meshWith } from "../src/operation/mesh.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const crown = (over: Partial<GearSpec> = {}, mate = 18): GearSpec => ({ teeth: 40, module: 2, ...over, bevel: { mate, shaft: crownShaft(over.teeth ?? 40, mate) }, ...(over.bevel ? {} : {}) });
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number; bbox: { min: number[]; max: number[] } }[];
const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };

test("a bevel gear whose shaft angle is 90 degrees plus the pinion's pitch angle is a crown gear; refusals say why", () => {
  assert.ok(isCrown(crown()));
  assert.ok(!isCrown({ teeth: 40, module: 2, bevel: { mate: 18 } }));
  assert.equal(err(crown()), "");
  assert.match(err(crown({}, 14)), /undercut/);
  assert.match(err(crown({ teeth: 8 }, 6)), /12 to 200/);
  assert.match(err(crown({ crown: { inner: 3 } })), /inner radius/);
  assert.match(err(crown({ pressure: 34 })), /come to a point|close/);
});

test("the gear command makes a crown gear: one body of the teeth and the plate, the teeth on the +n side of its plane", () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: crown({ bore: 5 }) });
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(scene(s).steps.map((x) => x.type), ["loft", "revolve", "combine", "extrude", "combine"]);
  assert.deepEqual(s.outcome.errors, {});
  const b = bodies(s);
  assert.equal(b.length, 1, "one body");
  const { min, max } = b[0]!.bbox;
  assert.ok(Math.abs(max[2]! - 2) < 0.05, `the tips stand m above the pitch plane: ${max[2]}`);
  assert.ok(Math.abs(min[2]! + 6.5) < 0.05, `the plate's foot a root and a thickness under it: ${min[2]}`);
  assert.ok(Math.abs(max[0]! - 41) < 0.1, `out to the plate (a half module past the teeth): ${max[0]}`);
});

test("a straight bevel pinion for a crown gear (the Mesh gear of it) fits it at its place and not half a pitch round", () => {
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec: crown({ backlash: 0.1 }) };
  const placed = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 18 }, 0);
  assert.ok(placed.ok, placed.ok ? "" : placed.error);
  const over = (turn: number): number => {
    let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, spec: src.spec });
    const pl = placed.ok ? placed.value : null!;
    s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: pl.at, turn: pl.turn + turn, spec: pl.spec });
    assert.ok(!s.message, s.message ?? "");
    const b = bodies(s);
    assert.equal(b.length, 2);
    const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref), params: { mode: "intersect" } } } as never);
    if (/nothing in common/.test(done.message ?? "")) return 0;
    return bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0;
  };
  const [fit, wrong] = [over(0), over(Math.PI / 18)];
  console.log("CROWN overlap", fit, wrong);
  assert.ok(fit < 12, `at its place: ${fit}`);
  assert.ok(wrong > 8 * Math.max(fit, 1), `half a pitch round: ${wrong}`);
});

test("a crown gear and its pinion are linked: the pinion's teeth changed in its box, the crown stays a crown gear at the new shaft angle and the pinion is placed again (`in_776`, `dec_crown_gears`)", () => {
  const spec = crown({ backlash: 0.1 });
  const src = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec };
  const p = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 18 }, 0);
  assert.ok(p.ok);
  const pv = p.ok ? p.value : null!;
  assert.equal(pv.spec.bevel?.with, "g_001");
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: src.at, spec });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: pv.at, turn: pv.turn, spec: pv.spec });
  assert.ok(!s.message, s.message ?? "");
  const rec2 = scene(s).gears!.find((g) => g.id === "g_002")!;
  const edited = run(s, { type: "setGear", id: "g_002", spec: { ...rec2.spec, teeth: 22 }, at: rec2.at, turn: rec2.turn } as never);
  assert.ok(!edited.message, edited.message ?? "");
  const [a, b] = ["g_001", "g_002"].map((id) => scene(edited).gears!.find((g) => g.id === id)!);
  assert.ok(isCrown(a!.spec), "still a crown gear");
  assert.equal(a!.spec.bevel!.mate, 22);
  assert.ok(Math.abs(a!.spec.bevel!.shaft! - crownShaft(40, 22)) < 1e-9);
  assert.equal(b!.spec.teeth, 22);
  assert.equal(b!.spec.bevel!.mate, 40);
  assert.deepEqual(edited.outcome.errors, {});
  // and the crown's teeth changed: the pinion's shaft angle follows
  const rec1 = scene(edited).gears!.find((g) => g.id === "g_001")!;
  const again = run(edited, { type: "setGear", id: "g_001", spec: { ...rec1.spec, teeth: 48, bevel: { ...rec1.spec.bevel!, shaft: crownShaft(48, 22) } }, at: rec1.at } as never);
  assert.ok(!again.message, again.message ?? "");
  const [c, d] = ["g_001", "g_002"].map((id) => scene(again).gears!.find((g) => g.id === id)!);
  assert.ok(isCrown(c!.spec) && c!.spec.teeth === 48);
  assert.equal(d!.spec.bevel!.mate, 48);
  assert.ok(Math.abs(d!.spec.bevel!.shaft! - crownShaft(48, 22)) < 1e-9);
});
