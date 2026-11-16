// Helical gears (`in_566`): the outline is the transverse section, the body is the twist of it, and both follow the numbers.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline, helixTwist } from "../src/operation/gear.ts";
import type { GearOutline, GearSpec } from "../src/operation/gear.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const must = (s: GearSpec): GearOutline => { const r = gearOutline(s); assert.ok(r.ok, r.ok ? "" : r.error); return (r as { value: GearOutline }).value; };
const vol = (s: Session) => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? ((p as { volume?: number }).volume ?? 0) : 0), 0);
const make = (spec: GearSpec, at: [number, number, number] = [0, 0, 0], id = "g_001") => run(createSession(kernel), { type: "gear", id, plane: worldRef("XY"), at, spec });

test("a helical gear's outline is the transverse section: module mn / cos(helix), pressure angle atan(tan(an) / cos(helix)), the tooth depth the same as the plain gear's", () => {
  const beta = (20 * Math.PI) / 180;
  const [spur, helical] = [must({ teeth: 24, module: 2 }), must({ teeth: 24, module: 2, helix: 20, width: 10 })];
  assert.ok(Math.abs(helical.pitchRadius - (2 * 24) / (2 * Math.cos(beta))) < 1e-9, `${helical.pitchRadius}`);
  assert.ok(Math.abs(helical.tipRadius - helical.pitchRadius - 2) < 1e-9, "the addendum is the normal module");
  assert.ok(Math.abs(helical.pitchRadius - helical.rootRadius - 2.5) < 1e-9, "the dedendum is 1.25 normal modules");
  assert.ok(helical.pitchRadius > spur.pitchRadius);
  assert.ok(Math.abs(helical.baseRadius - helical.pitchRadius * Math.cos(Math.atan(Math.tan(Math.PI / 9) / Math.cos(beta)))) < 1e-9);
  // a left hand gear has the same outline
  assert.deepEqual(must({ teeth: 24, module: 2, helix: -20, width: 10 }).points, helical.points);
});

test("the twist is width x tan(helix) / the transverse pitch radius, in degrees, with the sign of the hand", () => {
  const t = helixTwist({ teeth: 24, module: 2, helix: 20, width: 10 })!;
  assert.ok(Math.abs(t - ((10 * Math.tan((20 * Math.PI) / 180)) / (24 / Math.cos((20 * Math.PI) / 180))) * (180 / Math.PI)) < 1e-9);
  assert.equal(helixTwist({ teeth: 24, module: 2, helix: -20, width: 10 }), -t);
  assert.equal(helixTwist({ teeth: 24, module: 2 }), null);
});

test("limits: no helix angle, too steep, no width, a ring are refused with the reason", () => {
  const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };
  assert.match(err({ teeth: 20, module: 2, helix: 0, width: 10 }), /helix angle must be from 1 to 45/);
  assert.match(err({ teeth: 20, module: 2, helix: 50, width: 10 }), /helix angle must be from 1 to 45/);
  assert.match(err({ teeth: 20, module: 2, helix: 15, width: 0 }), /width/);
  assert.match(err({ teeth: 20, module: 2, helix: 15, width: 10, internal: true }), /ring/);
  assert.equal(err({ teeth: 20, module: 2, helix: 15, width: 10 }), "");
});

test("the gear command makes the outline and the twisted body: its volume is the outline's area times the width, the same for either hand", () => {
  const spur = make({ teeth: 20, module: 2, bore: 6, helix: 15, width: 10 });
  assert.ok(!spur.message, spur.message ?? "");
  assert.equal(scene(spur).steps.length, 1);
  assert.equal(scene(spur).steps[0]!.type, "revolve");
  assert.equal(scene(spur).steps[0]!.params.gear, "g_001");
  assert.deepEqual(spur.outcome.errors, {});
  const left = make({ teeth: 20, module: 2, bore: 6, helix: -15, width: 10 });
  assert.ok(Math.abs(vol(spur) - vol(left)) < 1e-4 * vol(spur));
  const g = must({ teeth: 20, module: 2, helix: 15, width: 10 });
  const want = (shoelace(g) - Math.PI * 9) * 10; // (the outline's area less the bore's, times the width)
  assert.ok(Math.abs(vol(spur) - want) < 0.003 * want, `${vol(spur)} against ${want}`);
});

/** the area of an outline: its polygon and the segment of each arc side */
function shoelace(g: GearOutline): number {
  let a = 0;
  const n = g.points.length;
  for (let i = 0; i < n; i++) {
    const [p, q] = [g.points[i]!, g.points[(i + 1) % n]!];
    a += (p[0] * q[1] - q[0] * p[1]) / 2;
    const b = g.bulges[i] ?? 0;
    if (b) { const ch = Math.hypot(q[0] - p[0], q[1] - p[1]); const th = 4 * Math.atan(2 * Math.abs(b)); const R = ch / (2 * Math.sin(th / 2)); a -= Math.sign(b) * 0.5 * R * R * (th - Math.sin(th)); }
  }
  return a;
}

test("editing a helical gear: the twist and the body follow its numbers, its centre and its hand; one that is no longer helical loses the twist; deleting it takes the twist away", () => {
  const spec: GearSpec = { teeth: 20, module: 2, bore: 6, helix: 15, width: 10 };
  let s = make(spec);
  const step = () => scene(s).steps.find((x) => x.params.gear === "g_001");
  assert.ok(Math.abs(Number(step()!.params.angle) - helixTwist(spec)!) < 1e-9);
  const next: GearSpec = { teeth: 24, module: 2, bore: 6, helix: -30, width: 12 };
  s = run(s, { type: "setGear", id: "g_001", spec: next });
  assert.ok(!s.message, s.message ?? "");
  assert.equal(scene(s).steps.length, 1);
  assert.ok(Math.abs(Number(step()!.params.angle) - helixTwist(next)!) < 1e-9 && Number(step()!.params.angle) < 0, "the other hand");
  assert.equal(step()!.params.advance, 12);
  assert.deepEqual(s.outcome.errors, {});
  const want = (shoelace(must(next)) - Math.PI * 9) * 12;
  assert.ok(Math.abs(vol(s) - want) < 0.003 * want, `${vol(s)} against ${want}`);
  // moved: the axis goes with it
  s = run(s, { type: "setGear", id: "g_001", spec: next, at: [30, 5, 0] });
  assert.deepEqual([step()!.params.ax, step()!.params.ay], [30, 5]);
  assert.deepEqual(s.outcome.errors, {});
  // no bore: the hole is taken out of the step
  s = run(s, { type: "setGear", id: "g_001", spec: { ...next, bore: undefined } });
  assert.equal(step()!.params.holes, undefined);
  assert.ok(vol(s) > want);
  // no longer helical
  const flat = run(s, { type: "setGear", id: "g_001", spec: { teeth: 24, module: 2 } });
  assert.equal(scene(flat).steps.length, 0);
  // deleted
  const gone = run(s, { type: "deleteGear", id: "g_001" });
  assert.equal(scene(gone).steps.length, 0);
  assert.equal(scene(gone).gears, undefined);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { entryOf, previewFor } from "../src/interaction/entry.ts";
import { meshWith } from "../src/operation/mesh.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";
import { selection } from "../src/interaction/session.ts";
import type { Vec3 } from "../src/math/vec.ts";

const env = { w: 800, h: 600 } as never;
const top = (): AppState => ({ ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 10, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, (env as { w: number }).w, (env as { h: number }).h).project(p);
const click = (st: AppState, p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((t, c) => key(t, c), st);
const C: Vec3 = [10, 10, 0];

test("the Helical gear tool: in the Gear submenu; Helix (15 shown) and Width are fields after Detail; typing teeth, helix and width and Enter makes the gear and its twisted body; nothing is left selected", () => {
  const ids = (reduce(top(), { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: { id: string }[] }[]).flatMap(function walk(i: any): string[] { return [i.id, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(ids.includes("tool:helical"));
  let st = reduce(top(), { type: "begin", name: "gear" }, env);
  st = reduce(st, { type: "runAction", id: "tool:helical" }, env);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } };
  st = click(st, C);
  const fields = entryOf(scene(st.session), st.tool, st.op)!.fields;
  assert.deepEqual(fields.map((f) => f.label), ["Teeth", "Module", "Pressure", "Shift", "Backlash", "Clearance", "Fillet", "Detail", "Helix", "Width", "Bore", "Flat", "Key", "Key depth"]);
  st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "2");
  assert.equal(entryOf(scene(st.session), st.tool, st.op)!.fields[8]!.value, "15", "a helix of 15 degrees unless another is typed");
  for (let i = 0; i < 7; i++) st = key(st, "Tab"); // (to Helix)
  st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "8");
  const preview = previewFor(scene(st.session), st.tool)!;
  assert.ok(preview.segments.some((seg) => Math.abs(seg[0][2] - 8) < 1e-6 || Math.abs(seg[1][2] - 8) < 1e-6), "the preview has the outline again at the far end, worked out in the page");
  st = key(st, "Enter");
  const rec = scene(st.session).gears![0]!;
  assert.deepEqual([rec.spec.teeth, rec.spec.module, rec.spec.helix, rec.spec.width], [20, 2, 20, 8]);
  assert.equal(scene(st.session).steps.filter((x) => x.type === "revolve").length, 1);
  assert.equal(selection(st.session).length, 0);
  assert.deepEqual(st.session.outcome.errors, {});
});

test("a partner of a helical gear has the opposite hand, the same module and width, and stands at the centre distance of the transverse sections; a rack is refused", () => {
  const spec: GearSpec = { teeth: 20, module: 2, helix: 15, width: 10 };
  const src: GearRecord = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec };
  const r = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 30 }, 0);
  assert.ok(r.ok, r.ok ? "" : r.error);
  const p = (r as { value: { at: Vec3; spec: GearSpec } }).value;
  assert.deepEqual([p.spec.helix, p.spec.width, p.spec.module, p.spec.teeth], [-15, 10, 2, 30]);
  assert.ok(Math.abs(p.at[0] - (2 * 50) / (2 * Math.cos((15 * Math.PI) / 180))) < 1e-9, `${p.at[0]}`);
  const rack = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 10, rack: true }, 0);
  assert.ok(!rack.ok);
});

import { gearOfPart } from "../src/operation/gearscene.ts";
test("selecting the body of a helical gear selects the gear: Edit gear opens its numbers", () => {
  const s = make({ teeth: 20, module: 2, helix: 15, width: 10 });
  const body = Object.values(scene(s).parts).find((p) => p.kind === "body")!;
  assert.equal(gearOfPart(scene(s), body.ref)?.id, "g_001");
});
