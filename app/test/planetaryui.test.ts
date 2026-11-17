// The planetary tool (`dec_planetary_gears`): started from the Gear submenu, its box (Sun teeth, Planet teeth, Planets, Ratio, ...), the ratio worked out to teeth or the teeth to a ratio, the ratio for each part held, made and then edited as a whole from any of its gears, moved and deleted with all of it.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { entryOf } from "../src/interaction/entry.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
const C: Vec3 = [10, 10, 0];
const top = (): AppState => ({ ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 10, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const click = (st: AppState, p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((t, c) => key(t, c), st);
const tab = (st: AppState, n: number) => Array.from({ length: n }).reduce<AppState>((t) => key(t, "Tab"), st);
const start = (): AppState => { let st = reduce(top(), { type: "begin", name: "gear" }, env); st = reduce(st, { type: "runAction", id: "tool:planetary" }, env); st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } }; return click(st, C); };
const box = (st: AppState) => entryOf(scene(st.session), st.tool, st.op)!;
const values = (st: AppState) => Object.fromEntries(box(st).fields.map((f) => [f.label, f.value]));

test("the box: Sun teeth, Planet teeth, Planets, Ratio, Module, Width, Helix, Pressure, Backlash, Clearance, Sun bore, Wall, Pin, Pin gap, Carrier; the ratio for each part held is shown", () => {
  const st = start();
  const e = box(st);
  assert.equal(e.panel, "Planetary gear set");
  assert.deepEqual(e.fields.map((f) => f.label), ["Sun teeth", "Planet teeth", "Planets", "Ratio", "Module", "Width", "Helix", "Pressure", "Backlash", "Clearance", "Sun bore", "Wall", "Pin", "Pin gap", "Carrier", "Plate gap"]);
  assert.deepEqual([values(st)["Sun teeth"], values(st)["Planet teeth"], values(st)["Planets"], values(st)["Ratio"]], ["24", "18", "3", "3.5"]);
  assert.match(e.info!, /Ring 60 teeth\. Ring held \(sun in, carrier out\): 3\.5:1\. Carrier held \(sun in, ring out, reversed\): -2\.5:1\. Sun held \(ring in, carrier out\): 1\.4:1\./);
});

test("a ratio typed gives the teeth; one tooth count typed keeps it; a ratio no whole teeth reach says so", () => {
  let st = tab(start(), 3); st = typeText(st, "5");
  const ring = Number(values(st)["Planet teeth"]) * 2 + Number(values(st)["Sun teeth"]);
  assert.equal(1 + ring / Number(values(st)["Sun teeth"]), 5);
  let k = start(); k = typeText(k, "24"); k = tab(k, 3); k = typeText(k, "5"); // sun 24 kept, ratio 5: ring 96, planet 36
  assert.deepEqual([values(k)["Sun teeth"], values(k)["Planet teeth"]], ["24", "36"]);
  let bad = start(); bad = typeText(bad, "20"); bad = tab(bad, 1); bad = typeText(bad, "13"); bad = tab(bad, 2); bad = typeText(bad, "5"); // both teeth typed: the ratio is only shown
  assert.equal(values(bad)["Ratio"], "5");
  assert.equal(entryOf(scene(bad.session), bad.tool, bad.op)!.fields.length, 16);
});

test("Enter makes the set: a sun, planets and a ring as gears, a carrier when its thickness is typed; the click after the centre makes it too", () => {
  let st = tab(start(), 3); st = typeText(st, "5"); st = tab(st, 11); st = typeText(st, "4"); // Carrier 4
  st = key(st, "Enter");
  const sc = scene(st.session);
  assert.equal(st.session.message, null);
  assert.equal(sc.planetaries!.length, 1);
  assert.equal(sc.gears!.length, 5);
  assert.ok(sc.planetaries![0]!.carrierStep);
  assert.equal(Object.values(sc.parts).filter((p) => p.kind === "body").length, 6);
  // the click after the centre makes it with the numbers as they stand
  let c = start(); c = click(c, [30, 30, 0]);
  assert.equal(scene(c.session).planetaries?.length, 1);
});

test("a set that cannot be made says why (planets that cannot be spaced evenly) and nothing is made", () => {
  let st = tab(start(), 2); st = typeText(st, "4"); // 4 planets: (24 + 60) / 4 = 21: fine; 5 planets: 84 / 5 is not whole
  st = typeText(st, "5");
  st = key(st, "Enter");
  assert.match(st.session.message ?? "", /not whole|taken back/);
  assert.equal(scene(st.session).planetaries, undefined);
});

function made(): AppState {
  let st = key(start(), "Enter");
  assert.equal(scene(st.session).planetaries!.length, 1);
  st = { ...reduce(st, { type: "escape" }, env), tool: null };
  return st;
}
const selectFace = (st: AppState, gearIndex: number): AppState => {
  const rec = scene(st.session).gears![gearIndex]!;
  const face = scene(st.session).parts[loopFaceRef(gearRefs(rec).lines) as never]!;
  return { ...st, session: { ...st.session, click: { ...st.session.click, selection: [face.ref] as never } } };
};

test("Edit gear on any gear of the set opens the whole set with its numbers; changing the planets changes every gear", () => {
  let st = selectFace(made(), 1);
  st = reduce(st, { type: "runAction", id: "gear:edit" }, env);
  assert.ok(st.tool?.gear?.planetary && st.tool.gear.editing);
  assert.deepEqual([values(st)["Sun teeth"], values(st)["Planets"]], ["24", "3"]);
  st = tab(st, 2); st = typeText(st, "4"); // 4 planets: 84 / 4 = 21
  st = key(st, "Enter");
  assert.equal(st.session.message, null);
  assert.equal(scene(st.session).gears!.length, 6);
  assert.equal(scene(st.session).planetaries![0]!.spec.planets, 4);
});

test("deleting a gear of the set deletes the set: its gears, bodies and record", () => {
  let st = selectFace(made(), 0);
  st = reduce(st, { type: "runAction", id: "delete" }, env);
  assert.equal(st.session.message, null);
  assert.equal(scene(st.session).planetaries, undefined);
  assert.equal(scene(st.session).gears, undefined);
});

test("selecting the carrier's body and Edit gear opens the whole set too", () => {
  let st = tab(start(), 14); st = typeText(st, "4"); st = key(st, "Enter"); // Carrier 4
  assert.equal(st.session.message, null);
  st = { ...reduce(st, { type: "escape" }, env), tool: null };
  const sc = scene(st.session);
  const carrier = Object.values(sc.parts).find((p) => p.kind === "body" && (p as { id?: string }).id === `x_${sc.planetaries![0]!.carrierStep}`)!;
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [carrier.ref] as never } } };
  st = reduce(st, { type: "runAction", id: "gear:edit" }, env);
  assert.ok(st.tool?.gear?.planetary && st.tool.gear.editing === "q_001");
});
