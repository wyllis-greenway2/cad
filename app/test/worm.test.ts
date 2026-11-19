// Worm gears (`dec_worm_gears`, `in_608`): the worm, the throated wheel as a loft through sections, and how they fit.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { wormGeometry, wheelOf } from "../src/operation/worm.ts";
import type { WormGeometry } from "../src/operation/worm.ts";
import { wheelSections, SECTIONS } from "../src/operation/wheelsections.ts";
import type { Section } from "../src/operation/wheelsections.ts";
import { meshWith } from "../src/operation/mesh.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";
import { gearOfPart } from "../src/operation/gearscene.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const worm: GearSpec = { teeth: 1, module: 2, worm: { diameter: 24, length: 30 } };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];
const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };

test("the numbers of a worm: the lead is the starts times pi times the module; the thread stands out a module and goes 1.25 modules below the pitch circle; refusals say why", () => {
  const g = wormGeometry(2, 2, 20, 24);
  assert.ok(g.ok);
  const w = (g as { value: WormGeometry }).value;
  assert.ok(Math.abs(w.lead - 2 * Math.PI * 2) < 1e-12 && Math.abs(w.px - 2 * Math.PI) < 1e-12);
  assert.ok(Math.abs(w.rTip - 14) < 1e-12 && Math.abs(w.rRoot - 9.5) < 1e-12);
  assert.ok(Math.abs(w.half(w.rp) - w.px / 4) < 1e-12, "the thread is half the pitch thick at the pitch circle (half of that either side)");
  assert.match(err({ teeth: 5, module: 2, worm: { diameter: 24, length: 30 } }), /1 to 4 starts/);
  assert.match(err({ teeth: 1, module: 2, worm: { diameter: 8, length: 30 } }), /too thin/);
  assert.match(err({ teeth: 1, module: 2, worm: { diameter: 24, length: 10 } }), /at least two leads/);
  assert.match(err({ teeth: 1, module: 2, pressure: 40, worm: { diameter: 24, length: 30 } }), /10 to 30 degrees/);
  assert.match(err({ ...worm, bore: 30 }), /bore must be smaller/);
  assert.match(err({ ...worm, flat: 1 }), /needs a bore/);
  assert.equal(err({ ...worm, flat: 1, bore: 6 }), "", "a worm has the same bores as any gear (`in_693`)");
  assert.equal(err(worm), "");
});

test("the gear command makes a worm: a core and a thread joined into one body, as a step of the gear; its volume is the core's and the thread's, less where they overlap", () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: worm });
  assert.ok(!s.message, s.message ?? "");
  assert.deepEqual(scene(s).steps.map((x) => x.type), ["revolve", "revolve", "revolve", "revolve"], "the core, the thread and the two run-outs cut away (`in_696`)");
  assert.ok(scene(s).steps.every((x) => x.params.gear === "g_001"));
  assert.deepEqual(s.outcome.errors, {});
  const b = bodies(s);
  assert.equal(b.length, 1, "one body: the thread is joined to the core");
  const core = Math.PI * 9.5 ** 2 * 30;
  assert.ok(b[0]!.volume > core + 1000 && b[0]!.volume < core + 5500, `${b[0]!.volume}`);
  assert.equal(gearOfPart(scene(s), b[0]!.ref as never)?.id, "g_001", "its body selects the gear");
});

test("a worm with two starts has two threads; a bore is a hole through the core", () => {
  const two = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...worm, teeth: 2, worm: { diameter: 24, length: 40 }, bore: 6 } });
  assert.ok(!two.message, two.message ?? "");
  assert.equal(scene(two).steps.length, 5, "the core, two threads, the two run-outs");
  assert.equal(bodies(two).length, 1);
  const none = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...worm, teeth: 2, worm: { diameter: 24, length: 40 } } });
  assert.ok(Math.abs(bodies(none)[0]!.volume - bodies(two)[0]!.volume - Math.PI * 9 * 40) < 0.01 * bodies(none)[0]!.volume, "the bore takes its cylinder out");
});

const wheelSpec: GearSpec = { teeth: 20, module: 2, wheel: { starts: 1, diameter: 24, width: 12 } };
test("the sections of a worm wheel: five outlines of 20 teeth, 13 sides to a tooth, the tips on an arc about the worm's axis (the throat) and the teeth turning across the width", () => {
  const t0 = Date.now();
  const r = wheelSections(wheelSpec);
  assert.ok(r.ok, r.ok ? "" : r.error);
  const secs = (r as { value: Section[] }).value;
  assert.equal(secs.length, SECTIONS);
  assert.ok(Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
  const w = wheelOf(wheelSpec);
  assert.ok(w.ok);
  for (const s of secs) {
    assert.equal(s.points.length, 20 * 13);
    const rs = s.points.map((p) => Math.hypot(p[0], p[1]));
    const tip = (w as { value: { tipAt: (h: number) => number } }).value.tipAt(s.h);
    assert.ok(Math.abs(Math.max(...rs) - tip) < 1e-3, `h ${s.h}: tip ${Math.max(...rs)} against ${tip}`);
  }
  assert.ok(secs[SECTIONS - 1]!.points[0]![0] !== secs[0]!.points[0]![0], "the teeth turn across the width");
  assert.match((wheelSections({ ...wheelSpec, wheel: { ...wheelSpec.wheel!, width: 40 } }) as { error: string }).error, /width of the wheel/);
});

/** the worm and its wheel in one scene, the wheel placed by the meshing helper; `closer` mm nearer than the centre distance */
function pair(side: number, offset: number, closer = 0): Session {
  const base = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: worm });
  const src: GearRecord = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: worm };
  const r = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 20, offset }, side > 0 ? Math.PI / 2 : -Math.PI / 2);
  assert.ok(r.ok, r.ok ? "" : r.error);
  const p = (r as { value: { at: Vec3; turn: number; spec: GearSpec } }).value;
  const at: Vec3 = [p.at[0], p.at[1] - side * closer, p.at[2]];
  const s = run(base, { type: "gear", id: "g_002", plane: worldRef("XY"), at, spec: p.spec, turn: p.turn });
  assert.ok(!s.message, s.message ?? "");
  return s;
}
function overlap(s: Session): number {
  const b = bodies(s);
  assert.equal(b.length, 2, "the worm and the wheel stand side by side");
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect", keep: 1 } } });
  if (Object.values(done.outcome.errors).some((e) => /nothing in common/.test(e))) return 0;
  assert.deepEqual(done.outcome.errors, {});
  const rest = bodies(done).map((x) => x.volume).sort((x, y) => y - x);
  return rest.slice(1).reduce((t, v) => t + v, 0); // (the bodies that stay are the wheel and the worm's; what is left over is the overlap)
}

test("the meshed wheel fits the worm: placed by the helper on either side of the worm and along it, the two overlap by under a cubic millimetre; a wheel 0.4 mm too near overlaps by a good deal more", () => {
  for (const [side, off] of [[1, 0], [-1, 0], [1, 3]] as const) {
    const o = overlap(pair(side, off));
    assert.ok(o < 1, `side ${side}, offset ${off}: overlap ${o} mm3`);
  }
  const near = overlap(pair(1, 0, 0.4));
  assert.ok(near > 5, `0.4 mm too near: overlap ${near} mm3`);
});

test("editing a worm wheel (Edit gear): another tooth count makes the body again; a worm that is no longer a worm loses its steps; deleting a wheel takes its steps", () => {
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: wheelSpec });
  assert.ok(!s.message, s.message ?? "");
  assert.equal(scene(s).steps.length, 1);
  assert.equal(scene(s).steps[0]!.type, "loft");
  const v1 = bodies(s)[0]!.volume;
  s = run(s, { type: "setGear", id: "g_001", spec: { ...wheelSpec, teeth: 24 } });
  assert.ok(!s.message, s.message ?? "");
  assert.equal(scene(s).steps.length, 1);
  assert.ok(bodies(s)[0]!.volume > v1, "more teeth, a bigger wheel");
  assert.equal(gearOfPart(scene(s), bodies(s)[0]!.ref as never)?.id, "g_001");
  const gone = run(s, { type: "deleteGear", id: "g_001" });
  assert.equal(scene(gone).steps.length, 0);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { entryOf, previewFor } from "../src/interaction/entry.ts";
import { selection } from "../src/interaction/session.ts";

const env = { w: 800, h: 600 } as never;
const top = (): AppState => ({ ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 10, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, 800, 600).project(p);
const click = (st: AppState, p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((t, c) => key(t, c), st);
const C: Vec3 = [10, 10, 0];
const open = (id: string): AppState => { let st = reduce(top(), { type: "begin", name: "gear" }, env); st = reduce(st, { type: "runAction", id }, env); return click({ ...st, tool: { ...st.tool!, plane: worldRef("XY") } }, C); };

test("the Worm and Worm wheel tools: in the Worm submenu of the Gear submenu; a worm's box is Starts, Module, Pressure, Diameter, Length, Bore; typing a number of starts and Enter makes it, its body at once and nothing left selected", () => {
  const ids = (reduce(top(), { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: { id: string }[] }[]).flatMap(function walk(i: any): string[] { return [i.id, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(ids.includes("tool:worm") && ids.includes("tool:wormwheel"));
  let st = open("tool:worm");
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => f.label), ["Starts", "Module", "Pressure", "Diameter", "Length", "Journal", "Run-out", "Bore", "Flat", "Key", "Key depth"]);
  assert.ok(previewFor(scene(st.session), st.tool)!.segments.length >= 6, "the box of its length is drawn");
  st = typeText(st, "2"); st = key(st, "Enter");
  const rec = scene(st.session).gears![0]!;
  assert.deepEqual([rec.spec.teeth, rec.spec.module, rec.spec.worm!.diameter], [2, 2, 20]);
  assert.equal(scene(st.session).steps.length, 5);
  assert.equal(selection(st.session).length, 0);
  assert.deepEqual(st.session.outcome.errors, {});
  // too many starts says so
  let bad = open("tool:worm"); bad = typeText(bad, "9"); bad = key(bad, "Enter");
  assert.match(bad.session.message ?? "", /1 to 4 starts/);
  const w = open("tool:wormwheel");
  assert.deepEqual(entryOf(scene(w.session), w.tool, w.op)!.fields.map((f) => f.label), ["Teeth", "Starts", "Module", "Pressure", "Worm diameter", "Width", "Land", "Bore", "Flat", "Key", "Key depth", "Chamfer", "Edge chamfer"]);
});

test("Mesh gear on a worm makes its wheel: Teeth, Offset, Width and Bore are its fields; the pointer says which side of the worm; one undo takes the wheel away", () => {
  let st = open("tool:worm");
  st = typeText(st, "1"); st = key(st, "Tab"); st = typeText(st, "2"); st = key(st, "Enter"); // (a worm of module 2, 20 mm across)
  assert.ok(!st.session.message, st.session.message ?? "");
  const body = bodies(st.session)[0]!;
  let m: AppState = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body.ref] as never } } } as AppState;
  m = reduce(m, { type: "runAction", id: "gear:mesh" }, env);
  assert.ok(m.tool?.gear?.mesh, "the mesh tool is open");
  assert.deepEqual(entryOf(scene(m.session), m.tool, m.op)!.fields.map((f) => f.label), ["Teeth", "Offset", "Width", "Land", "Bore", "Flat", "Key", "Key depth"]);
});

test("a worm and a wheel have a D flat or a keyway bore as any gear does (`in_693`): the worm's is cut along its axis, the wheel's is a hole in each section; the flat takes less out than the round bore and the keyway more", () => {
  const make = (spec: GearSpec) => { const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }); assert.ok(!s.message, s.message ?? ""); assert.deepEqual(s.outcome.errors, {}); assert.equal(bodies(s).length, 1); return bodies(s)[0]!.volume; };
  const w0 = { ...worm, bore: 8 };
  const [round, flat, key] = [make(w0), make({ ...w0, flat: 1 }), make({ ...w0, key: 3 })];
  assert.ok(flat > round, `a flat leaves more material than the round bore (${flat} > ${round})`);
  assert.ok(key < round, `a keyway takes more out (${key} < ${round})`);
  const h0 = { ...wheelSpec, bore: 8 };
  const [wr, wf, wk] = [make(h0), make({ ...h0, flat: 1 }), make({ ...h0, key: 3 })];
  assert.ok(wf > wr && wk < wr, `the wheel: ${wf} > ${wr} > ${wk}`);
});

test("the ends of a worm (`in_696`): journals with the thread running out into the shaft (the default), a thread that stops square, or no journals and the thread cut flat; the box shows the journal and run-out it has", () => {
  const make = (w: { journal?: number; runout?: number }) => {
    const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...worm, worm: { diameter: 24, length: 30, ...w } } });
    assert.ok(!s.message, s.message ?? ""); assert.deepEqual(s.outcome.errors, {}); assert.equal(bodies(s).length, 1, "one body");
    const b = Object.values(scene(s).parts).find((p) => p.kind === "body") as { volume: number; bbox: { min: Vec3; max: Vec3 } };
    return { volume: b.volume, length: b.bbox.max[0] - b.bbox.min[0] };
  };
  const [run1, square, flush] = [make({}), make({ runout: 0 }), make({ journal: 0 })];
  assert.ok(run1.volume < square.volume, `the run-out takes the end wall of the thread away (${run1.volume} < ${square.volume})`);
  assert.ok(flush.volume > run1.volume, "a thread that runs the whole length has more of it");
  for (const x of [run1, square, flush]) assert.ok(Math.abs(x.length - 30) < 1e-3, `the worm is as long as asked (${x.length})`);
  assert.match(err({ ...worm, worm: { diameter: 24, length: 30, journal: 0.5 } }), /journal/);
  assert.match(err({ ...worm, worm: { diameter: 24, length: 30, journal: 9 } }), /journal/);
  assert.match(err({ ...worm, worm: { diameter: 24, length: 30, runout: 99 } }), /run-out/);
  assert.equal(err({ ...worm, worm: { diameter: 24, length: 13, journal: 3 } }), "", "a short journal is made as long as the thread's end wall needs");
});

test("a worm for a worm wheel (`in_697`): placed by the helper on either side of the wheel, the two overlap by under a cubic millimetre; it has the starts the wheel was made for; a rack and a ring are refused", () => {
  for (const [dir, off] of [[-Math.PI / 2, 0], [Math.PI / 2, 0], [-Math.PI / 2, 3]] as const) {
    const w: GearSpec = { teeth: 20, module: 2, wheel: { starts: 1, diameter: 24, width: 12 } };
    const base = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: w });
    const src: GearRecord = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: w };
    const r = meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 1, offset: off }, dir);
    assert.ok(r.ok, r.ok ? "" : r.error);
    const p = (r as { value: { at: Vec3; turn: number; spec: GearSpec } }).value;
    assert.ok(p.spec.worm && p.spec.worm.diameter === 24 && p.spec.teeth === 1);
    const s = run(base, { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.at, spec: p.spec, turn: p.turn });
    assert.ok(!s.message, s.message ?? "");
    const o = overlap(s);
    assert.ok(o < 1, `direction ${dir}, offset ${off}: overlap ${o} mm3`);
  }
  const src: GearRecord = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { teeth: 20, module: 2, wheel: { starts: 1, diameter: 24, width: 12 } } };
  assert.match((meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 2 }, 0) as { error: string }).error, /start/);
  assert.ok(!meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 1, rack: true }, 0).ok);
  assert.ok(!meshWith(src, [1, 0, 0], [0, 1, 0], { teeth: 1, ring: true }, 0).ok);
});

test("a worm wheel's land (`in_790`): the tooth section carried straight out to each face and cut back by the worm's envelope: width + 2 land thick, heavier, one body (the steps name each other's bodies); Mesh gear gives no land unless one is typed, and with one the pair still does not touch", () => {
  const withLand = (land: number | undefined) => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { ...wheelSpec, wheel: { ...wheelSpec.wheel!, ...(land !== undefined ? { land } : {}) } } });
  const [none, land] = [withLand(undefined), withLand(2)];
  assert.deepEqual(scene(land).steps.map((st) => st.type), ["loft", "extrude", "extrude", "sewBodies", "extrude", "extrude", "combine", "combine"]);
  assert.deepEqual(scene(land).steps.filter((st) => st.type === "combine" || st.type === "sewBodies").map((st) => st.parts.length), [3, 2, 2]);
  assert.equal(bodies(land).length, 1, "one body");
  const box = (s: Session) => (Object.values(scene(s).parts).find((p) => p.kind === "body") as unknown as { bbox: { min: Vec3; max: Vec3 } }).bbox;
  const [a, b] = [box(none), box(land)];
  assert.ok(Math.abs(b.max[2] - b.min[2] - (a.max[2] - a.min[2]) - 4) < 1e-3, `4 mm thicker: ${b.max[2] - b.min[2]} against ${a.max[2] - a.min[2]}`);
  assert.ok(bodies(land)[0]!.volume > bodies(none)[0]!.volume + 100);
  assert.equal(wheelOf({ ...wheelSpec, wheel: { ...wheelSpec.wheel!, land: 9 } }).ok, false, "more than 4 modules is refused");
  const r = meshWith({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: worm }, [1, 0, 0], [0, 1, 0], { teeth: 20 }, Math.PI / 2);
  assert.equal((r as { value: { spec: GearSpec } }).value.spec.wheel!.land, 0, "no land by default");
  // with a land the pair still stands side by side and does not overlap: the land is cut back by the worm's envelope
  const withLandPair = meshWith({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: worm }, [1, 0, 0], [0, 1, 0], { teeth: 20, land: 2 }, Math.PI / 2);
  assert.ok(withLandPair.ok);
  const p = (withLandPair as { value: { at: Vec3; turn: number; spec: GearSpec } }).value;
  assert.equal(p.spec.wheel!.land, 2);
  const both = run(run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: worm }), { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.at, spec: p.spec, turn: p.turn });
  assert.deepEqual(both.outcome.errors, {});
  assert.ok(overlap(both) < 1, `the worm and the wheel with a land overlap by ${overlap(both)} mm3`);
});

test("defaults (`in_864`): a worm is 25 modules long; a new worm wheel has a bore, the worm has none; a wheel made by Mesh gear has one too", () => {
  let w = reduce(top(), { type: "begin", name: "gear" }, env);
  w = reduce(top(), { type: "runAction", id: "tool:worm" }, env);
  w = click(w, [10, 10, 0]);
  const worm = entryOf(scene(w.session), w.tool, w.op)!.fields;
  assert.equal(worm.find((f) => f.label === "Length")!.value, "50", "25 modules of 2 mm");
  assert.equal(worm.find((f) => f.label === "Bore")!.value, "0");
  let wheel = reduce(top(), { type: "runAction", id: "tool:wormwheel" }, env);
  wheel = click(wheel, [10, 10, 0]);
  assert.notEqual(entryOf(scene(wheel.session), wheel.tool, wheel.op)!.fields.find((f) => f.label === "Bore")!.value, "0", "a bore");
  const r = meshWith({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: worm0 }, [1, 0, 0], [0, 1, 0], { teeth: 20 }, Math.PI / 2);
  assert.ok(r.ok);
});
const worm0: GearSpec = { teeth: 1, module: 2, worm: { diameter: 24, length: 50 } };
