// A helical rack (`in_783`): the section across the rack (module mn / cos(helix)) slid along the rack through the thickness; it meshes with a helical gear of the opposite hand number rule the gear tool uses.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline, helixShear } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { meshWith } from "../src/operation/mesh.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";
import { canHelix } from "../src/interaction/tools.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const rackSpec: GearSpec = { teeth: 10, module: 2, rack: true, helix: 20, width: 12 };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number; bbox: { min: Vec3; max: Vec3 } }[];

test("a rack can have a helix; its outline is the section across it: pitch pi mn / cos, the same depth of tooth, and the numbers are refused when they are no helix", () => {
  assert.ok(canHelix({ teeth: 10, module: 2, rack: true }));
  const [plain, helical] = [gearOutline({ teeth: 10, module: 2 + 0, rack: true }), gearOutline(rackSpec)];
  assert.ok(plain.ok && helical.ok);
  if (!plain.ok || !helical.ok) return;
  const k = Math.cos((20 * Math.PI) / 180);
  assert.ok(Math.abs(helical.value.length! - (10 * Math.PI * 2) / k) < 1e-9, "the length is teeth x the transverse pitch");
  assert.equal(helical.value.tipRadius, plain.value.tipRadius, "the addendum is the normal module");
  assert.equal(helical.value.rootRadius, plain.value.rootRadius);
  assert.ok(Math.abs(helixShear(rackSpec)! - Math.tan((20 * Math.PI) / 180)) < 1e-12);
  assert.equal(helixShear({ teeth: 10, module: 2, rack: true }), null);
  assert.match((gearOutline({ ...rackSpec, helix: 60 }) as { error: string }).error, /helix angle must be from 1 to 45/);
  assert.match((gearOutline({ ...rackSpec, width: 0 }) as { error: string }).error, /width/);
});

test("the body of a helical rack is its section slid along it: the right volume and a box wider by thickness x tan(helix)", () => {
  const plain = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...rackSpec, helix: undefined, width: 12 } });
  const helical = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: rackSpec });
  assert.ok(!helical.message, helical.message ?? "");
  assert.deepEqual(helical.outcome.errors, {});
  assert.deepEqual(scene(helical).steps.map((x) => x.type), ["extrude"]);
  const [b] = bodies(helical);
  const o = gearOutline(rackSpec);
  assert.ok(o.ok);
  const area = o.ok ? Math.abs(o.value.points.reduce((t, p, i) => { const q = o.value.points[(i + 1) % o.value.points.length]!; return t + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0)) : 0;
  assert.ok(Math.abs(b!.volume - area * 12) < 1, `volume ${b!.volume} against ${area * 12}`);
  const w = b!.bbox.max[0] - b!.bbox.min[0];
  const w0 = o.ok ? o.value.length! : 0;
  assert.ok(Math.abs(w - (w0 + 12 * Math.tan((20 * Math.PI) / 180))) < 1e-3, `width ${w} against ${w0 + 12 * Math.tan((20 * Math.PI) / 180)}`);
  assert.equal(bodies(plain).length, 1);
});

function overlap(s: Session): number {
  const b = bodies(s);
  assert.equal(b.length, 2);
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect", keep: 1 } } });
  if (Object.values(done.outcome.errors).some((e) => /nothing in common/.test(e))) return 0;
  assert.deepEqual(done.outcome.errors, {});
  return bodies(done).map((x) => x.volume).sort((x, y) => y - x).slice(1).reduce((t, v) => t + v, 0);
}

test("a helical gear and the rack Mesh rack makes fit (the teeth do not overlap), a rack of the wrong hand overlaps a good deal; and Mesh gear on the rack makes the gear back", () => {
  const gear: GearSpec = { teeth: 20, module: 2, helix: 20, width: 12 };
  const src: GearRecord = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: gear };
  const base = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: gear });
  const r = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 10, rack: true }, -Math.PI / 2);
  assert.ok(r.ok, r.ok ? "" : r.error);
  const p = (r as { value: { at: Vec3; turn: number; spec: GearSpec } }).value;
  assert.deepEqual([p.spec.rack, p.spec.helix, p.spec.width], [true, 20, 12]);
  const fit = run(base, { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.at, spec: p.spec, turn: p.turn });
  assert.ok(!fit.message, fit.message ?? "");
  const [good, wrong] = [overlap(fit), overlap(run(base, { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.at, spec: { ...p.spec, helix: -20 }, turn: p.turn }))];
  assert.ok(good < 8, `the right hand rack overlaps by ${good} mm3`);
  assert.ok(wrong > 3 * Math.max(good, 1), `the wrong hand overlaps by ${wrong} mm3 against ${good}`);
  // the gear made for the rack has the rack's helix
  const back = meshWith({ id: "g_002", plane: worldRef("XY"), at: p.at, spec: p.spec, turn: p.turn }, [1, 0, 0], [0, 1, 0], { teeth: 20 }, 0);
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.equal((back as { value: { spec: GearSpec } }).value.spec.helix, 20);
});
