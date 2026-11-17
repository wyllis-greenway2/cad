// Helical gears (`in_598`): the outline is the transverse section, the body is the twist of it, and both follow the numbers.
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

const plainGear = (): AppState => {
  let st = reduce(top(), { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "2");
  st = key(st, "Enter");
  const made = Object.values(scene(st.session).parts).find((p) => p.kind === "face" && p.ref.includes("g_"))!;
  st = reduce(st, { type: "escape" }, env);
  return { ...st, tool: null, session: { ...st.session, click: { ...st.session.click, selection: [made.ref] } } };
};

test("Helix is a number of every plain gear (`in_693`): 0 is a plain gear; typing one makes it a body with its twist; the Helix item opens the box at it; 0 takes it off again", () => {
  const st0 = plainGear();
  const items = (reduce(st0, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; enabled: boolean; children?: { id: string; enabled: boolean }[] }[]).flatMap(function walk(i: any): { id: string; enabled: boolean }[] { return [i, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(items.find((i) => i.id === "gear:helix")!.enabled);
  assert.ok(!items.some((i) => i.id === "tool:helical" || i.id === "gear:unhelix"));
  let st = reduce(st0, { type: "runAction", id: "gear:helix" }, env);
  assert.equal(st.tool!.gear!.editing, "g_001");
  assert.equal(st.tool!.gear!.field, 7, "the box starts at the Helix field");
  const fields = entryOf(scene(st.session), st.tool, st.op)!.fields;
  assert.deepEqual(fields.map((f) => f.label), ["Teeth", "Module", "Pressure", "Shift", "Backlash", "Clearance", "Fillet", "Helix", "Width", "Bore", "Flat", "Key", "Key depth"]);
  assert.equal(fields[7]!.value, "0", "no helix: a plain gear");
  st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "8");
  const preview = previewFor(scene(st.session), st.tool)!;
  assert.ok(preview.segments.some((seg) => Math.abs(seg[0][2] - 8) < 1e-6 || Math.abs(seg[1][2] - 8) < 1e-6), "the preview has the outline again at the far end");
  st = key(st, "Enter");
  const rec = scene(st.session).gears![0]!;
  assert.deepEqual([rec.spec.teeth, rec.spec.module, rec.spec.helix, rec.spec.width], [20, 2, 20, 8]);
  assert.equal(scene(st.session).steps.filter((x) => x.type === "revolve").length, 1);
  assert.deepEqual(st.session.outcome.errors, {});
  // 0 takes it off again
  const body = Object.values(scene(st.session).parts).find((p) => p.kind === "body")!;
  let off: AppState = { ...st, tool: null, session: { ...st.session, click: { ...st.session.click, selection: [body.ref] } } };
  off = reduce(off, { type: "runAction", id: "gear:helix" }, env);
  off = typeText(off, "0"); off = key(off, "Enter");
  assert.equal(scene(off.session).gears![0]!.spec.helix, undefined);
  assert.equal(scene(off.session).steps.filter((x) => x.type === "revolve").length, 0, "the twist goes with it");
});

test("a helix typed when the gear is made makes it 3D at once", () => {
  let st = reduce(top(), { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "2");
  for (let i = 0; i < 6; i++) st = key(st, "Tab");
  st = typeText(st, "15");
  st = key(st, "Enter");
  assert.equal(scene(st.session).gears![0]!.spec.helix, 15);
  assert.equal(scene(st.session).steps.filter((x) => x.type === "revolve").length, 1);
});

test("a helix is put on a plain gear only: not on a ring (the item says why)", () => {
  let st = reduce(top(), { type: "begin", name: "gear" }, env);
  st = reduce(st, { type: "runAction", id: "tool:ring" }, env);
  st = click(st, C);
  st = typeText(st, "40"); st = key(st, "Tab"); st = typeText(st, "2");
  st = key(st, "Enter");
  const made = Object.values(scene(st.session).parts).find((p) => p.kind === "face" && p.ref.includes("g_"))!;
  st = { ...st, tool: null, session: { ...st.session, click: { ...st.session.click, selection: [made.ref] } } };
  const items = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; enabled: boolean; why?: string | null; children?: any[] }[]).flatMap(function walk(i: any): any[] { return [i, ...(i.children ?? []).flatMap(walk)]; });
  const it = items.find((i) => i.id === "gear:helix")!;
  assert.ok(!it.enabled && /plain gear/.test(it.why ?? ""));
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

test("Mesh gear on a helical gear makes the partner (a helical gear of the opposite hand) when Enter or a click applies it (`in_691`)", () => {
  let st = reduce(plainGear(), { type: "runAction", id: "gear:helix" }, env);
  st = typeText(st, "15"); st = key(st, "Enter");
  assert.equal(scene(st.session).gears![0]!.spec.helix, 15);
  const body = Object.values(scene(st.session).parts).find((p) => p.kind === "body")!;
  st = { ...st, tool: null, session: { ...st.session, click: { ...st.session.click, selection: [body.ref] } } };
  st = reduce(st, { type: "runAction", id: "gear:mesh" }, env);
  assert.ok(st.tool?.gear?.mesh, `the mesh tool is open: ${st.session.message}`);
  assert.ok(previewFor(scene(st.session), st.tool), "an outline is drawn before the pointer moves");
  const noMove = key(st, "Enter");
  assert.equal(scene(noMove.session).gears!.length, 2, `Enter makes it where the tool stands (${noMove.session.message})`);
  st = reduce(st, { type: "hover", x: px(st, [C[0] + 60, C[1], 0])[0], y: px(st, [C[0] + 60, C[1], 0])[1] }, env);
  st = key(st, "Enter");
  assert.equal(scene(st.session).gears!.length, 2, `a partner is made (${st.session.message})`);
  assert.equal(scene(st.session).gears![1]!.spec.helix, -scene(st.session).gears![0]!.spec.helix!);
  assert.deepEqual(st.session.outcome.errors, {});
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "body").length, 2, "and its body");
});
