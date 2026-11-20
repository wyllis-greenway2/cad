// Cut spokes (`dec_hub_spoke`): the wheel cut into a round body that is selected, keeping its bore and its outside edge: its numbers are read from the body, the web is cut down from both faces, the cutouts are cut through it.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawCircle } from "../src/operation/build.ts";
import { roundBodyOf, bodyOfPart, cutFillOf } from "../src/operation/roundbody.ts";
import { modelTarget, modelEntry, modelPreview } from "../src/interaction/modeltool.ts";
import { entryOf } from "../src/interaction/entry.ts";
import { asCommand } from "../src/operation/modelparts.ts";
import { figureParams, nextId } from "../src/operation/scene.ts";
import type { Command } from "../src/operation/commands.ts";
import { wheelLines } from "../src/operation/modelwheel.ts";
import type { WheelSpec } from "../src/operation/modelwheel.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const XY = worldRef("XY");
type B = { ref: string; id: string; volume: number; bbox: { min: number[]; max: number[] } };
const bodiesOf = (st: { session: ReturnType<typeof createSession> }): B[] => Object.values(scene(st.session).parts).filter((p) => p.kind === "body") as unknown as B[];

/** a disc 60 across and 10 thick with a bore of 8, standing on the ground plane with its middle at the origin: the body to cut spokes into */
function disc() {
  let s = createSession(kernel);
  const outer = drawCircle(scene(s), XY, [0, 0, 0], 30); s = run(s, outer.command);
  const hole = drawCircle(scene(s), XY, [0, 0, 0], 4); s = run(s, hole.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [outer.circle], params: { depth: 10, ...figureParams([{ outer: [outer.circle], holes: [[hole.circle]] }]) } } } as Command);
  return s;
}

test("a disc with a bore is read: its axis, its outside, its bore, its thickness", () => {
  const s = disc(), body = bodiesOf({ session: s })[0]!;
  const rb = roundBodyOf(scene(s), body.ref as never);
  assert.ok(typeof rb !== "string", String(rb));
  if (typeof rb === "string") return;
  assert.ok(Math.abs(rb.outer - 30) < 0.05 && Math.abs(rb.bore - 4) < 0.05 && Math.abs(rb.thickness - 10) < 0.05, `${rb.outer} ${rb.bore} ${rb.thickness}`);
  assert.ok(Math.abs(Math.abs(rb.normal[2]) - 1) < 1e-6, "its axis is z");
  assert.ok(Math.abs(rb.center[2] - 5) < 0.05, `its middle is half way along it: ${rb.center}`);
  assert.equal(bodyOfPart(scene(s), body.ref as never), body.ref);
  assert.equal(rb.root, 0, "a disc has no teeth");
});

test("Cut spokes on a selected disc keeps the bore and the outside edge and takes the metal from the web and the cutouts", () => {
  const s0 = disc(), body = bodiesOf({ session: s0 })[0]!, whole = body.volume;
  let st: ReturnType<typeof createState> = { ...createState(s0), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body.ref as never] } } };
  st = reduce(st, { type: "runAction", id: "model:wheelcut" }, env);
  assert.ok(st.tool?.fill?.cut, `the tool is armed on the disc: ${st.session.message}`);
  const g = modelTarget(scene(st.session), st.tool!)!;
  assert.equal(g.problem, null, g.problem ?? "");
  assert.ok(Math.abs(g.nums.outer! - 60) < 0.1 && Math.abs(g.nums.bore! - 8) < 0.1 && Math.abs(g.nums.rimT! - 10) < 0.1, `the body's numbers: ${g.nums.outer} ${g.nums.bore} ${g.nums.rimT}`);
  assert.ok(g.nums.web! < 10, "the web is thinner than the body");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  let n = 0; while (st.building && n++ < 12) st = reduce(st, { type: "buildNext" }, env);
  assert.ok(!st.session.message, `no complaint: ${st.session.message}`);
  const after = bodiesOf(st);
  assert.equal(after.length, 1, "still one body: it was cut, not added to");
  assert.ok(Math.abs(after[0]!.bbox.max[0]! - after[0]!.bbox.min[0]! - 60) < 0.1, "the outside edge is kept: still 60 across");
  assert.ok(Math.abs(after[0]!.bbox.max[2]! - after[0]!.bbox.min[2]! - 10) < 0.05, "and 10 thick");
  assert.ok(after[0]!.volume < whole * 0.8 && after[0]!.volume > whole * 0.3, `metal taken from the web: ${after[0]!.volume.toFixed(0)} of ${whole.toFixed(0)} mm3 is left`);
  // the metal taken: the two pockets (the web's thickness left), then the cutouts through it; the join radii put a little back, the rounds on the cutouts take a little more
  const w = g.nums, pockets = Math.PI * (((w.rimD! / 2) ** 2) - ((w.hub! / 2) ** 2)) * (w.rimT! - w.web!), windows = wheelLines(w as unknown as WheelSpec).slice(4).reduce((a, l) => a + Math.abs(l.slice(0, -1).reduce((q, p, i) => q + p[0] * l[i + 1]![1] - l[i + 1]![0] * p[1], 0)) / 2, 0) * w.web!;
  assert.ok(Math.abs(whole - pockets - windows - after[0]!.volume) < 0.08 * (pockets + windows), `the disc ${whole.toFixed(0)} less pockets ${pockets.toFixed(0)} and cutouts ${windows.toFixed(0)} is ${(whole - pockets - windows).toFixed(0)}, the body has ${after[0]!.volume.toFixed(0)}`);
  const kinds = scene(st.session).steps.map((x) => `${x.type}:${x.params.mode ?? ""}`);
  assert.equal(kinds.filter((k) => k === "edgeMod:fillet").length >= 1, true, "the joins and the rounds are fillets: " + kinds.join(" "));
  assert.equal(kinds.filter((k) => k === "extrude:cut").length, 3, "two pockets and the cutouts are cuts: " + kinds.join(" "));
  // the bore is kept: a pin of its size goes through (no body surface closer to the axis than the bore's radius)
  const edges = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && p.circle) as { circle: { radius: number } }[];
  assert.ok(edges.some((e) => Math.abs(e.circle.radius - 4) < 0.02), "the bore's circle is still there");
});

test("with nothing selected the box still comes up and waits for the round body to be clicked; a part of a round body gives its numbers", () => {
  let st: ReturnType<typeof createState> = { ...createState(disc()), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "model:wheelcut" }, env);
  assert.ok(st.tool && !st.tool.fill, "the tool is armed, with no body yet");
  assert.match(st.session.message ?? "", /click the round body/);
  const e = entryOf(scene(st.session), st.tool!, null);
  assert.ok(e && e.panel?.startsWith("Cut spokes"), "the box is up");
  assert.match(e?.info ?? e?.warn ?? "", /round body|click/);
  const sc = scene(st.session), body = bodiesOf(st)[0]!, face = Object.values(sc.parts).find((p) => p.kind === "plane" && p.origin === "body")!;
  for (const ref of [body.ref, face.ref]) { const got = cutFillOf(sc, ref as never); assert.ok(typeof got !== "string", String(got)); if (typeof got !== "string") assert.ok(Math.abs(got.cut.outer - 30) < 0.05, `from ${ref}`); }
  assert.equal(typeof cutFillOf(sc, "w/XY" as never), "object", "with one body in the scene, anything selected means it");
});

test("Cut spokes in a solid cylinder (no bore): a hub of its usual share of the wheel, and the spokes are cut", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 20); s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 15, ...figureParams([{ outer: [c.circle], holes: [] }]) } } } as Command);
  const body = bodiesOf({ session: s })[0]!, whole = body.volume;
  let st: ReturnType<typeof createState> = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body.ref as never] } } };
  st = reduce(st, { type: "runAction", id: "model:wheelcut" }, env);
  const g = modelTarget(scene(st.session), st.tool!)!;
  assert.equal(g.problem, null);
  assert.equal(g.nums.bore, 0);
  assert.ok(g.nums.hub! > 0.15 * g.nums.outer!, `a hub of ${g.nums.hub} mm on a wheel of ${g.nums.outer}`);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  let n = 0; while (st.building && n++ < 12) st = reduce(st, { type: "buildNext" }, env);
  assert.ok(!st.session.message, `no complaint: ${st.session.message}`);
  assert.equal(bodiesOf(st).length, 1);
  assert.ok(bodiesOf(st)[0]!.volume < whole * 0.8, "metal taken");
});

test("a gear is read from its teeth and its bore: the tips are the outside, the whole circle inside is the bore, the roots are the limit of the rim", () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 30, module: 2, pressure: 20, width: 8, bore: 10 } } as unknown as Command);
  const body = bodiesOf({ session: s })[0]!, rb = roundBodyOf(scene(s), body.ref as never);
  assert.ok(typeof rb !== "string", String(rb));
  if (typeof rb === "string") return;
  assert.ok(rb.outer > 31 && rb.outer < 32.5, `the tips: 30 teeth of module 2 have a tip radius of 32: ${rb.outer}`);
  assert.ok(Math.abs(rb.bore - 5) < 0.05, `the bore: ${rb.bore}`);
  assert.ok(rb.root > 26 && rb.root < 30, `the roots: ${rb.root}`);
  assert.ok(Math.abs(rb.thickness - 8) < 0.05, `${rb.thickness}`);
});

test("Cut spokes in a gear keeps its teeth and its bore: the rim stays inside the roots", () => {
  const s0 = run(createSession(kernel), { type: "gear", id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 30, module: 2, pressure: 20, width: 8, bore: 10 } } as unknown as Command);
  const body = bodiesOf({ session: s0 })[0]!, whole = body.volume;
  let st: ReturnType<typeof createState> = { ...createState(s0), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body.ref as never] } } };
  st = reduce(st, { type: "runAction", id: "model:wheelcut" }, env);
  assert.ok(st.tool?.fill?.cut, `armed: ${st.session.message}`);
  const g = modelTarget(scene(st.session), st.tool!)!;
  assert.equal(g.problem, null, g.problem ?? "");
  assert.ok(g.nums.rimD! <= g.nums.rimMax! + 1e-6 && g.nums.rimMax! > 50, `the rim diameter ${g.nums.rimD} stays inside the roots (${g.nums.rimMax})`);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  let n = 0; while (st.building && n++ < 12) st = reduce(st, { type: "buildNext" }, env);
  assert.ok(!st.session.message, `no complaint: ${st.session.message}`);
  const after = bodiesOf(st);
  assert.equal(after.length, 1);
  assert.ok(Math.abs(after[0]!.bbox.max[0]! - body.bbox.max[0]!) < 1e-3 && Math.abs(after[0]!.bbox.min[0]! - body.bbox.min[0]!) < 1e-3, "the teeth are kept: the same width across");
  assert.ok(after[0]!.volume < whole * 0.85, `metal taken: ${after[0]!.volume.toFixed(0)} of ${whole.toFixed(0)}`);
});

test("the Cut spokes box has the same numbers as the Wheel's, those that come from the body shown dimmed, and its picture is in space", () => {
  let st: ReturnType<typeof createState> = { ...createState(disc()), cam: homeCamera() };
  const body = bodiesOf(st)[0]!;
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body.ref as never] } } };
  st = reduce(st, { type: "runAction", id: "model:wheelcut" }, env);
  const fields = modelEntry(scene(st.session), st.tool!)!.fields;
  assert.deepEqual(fields.map((f) => f.label).slice(0, 7), ["Outer diameter", "Rim diameter", "Hub diameter", "Bore diameter", "Rim thickness", "Spoke thickness", "Hub thickness"]);
  assert.deepEqual(fields.filter((f) => f.locked).map((f) => f.label), ["Outer diameter", "Bore diameter", "Rim thickness", "Hub thickness", "Draft"], "the body's own numbers are shown, not set");
  assert.equal(fields.find((f) => f.label === "Outer diameter")!.value, "60");
  assert.equal(fields.find((f) => f.label === "Bore diameter")!.value, "8");
  const segs = modelPreview(scene(st.session), st.tool!)!.segments, zs = segs.flatMap(([a, b]) => [a[2], b[2]]);
  assert.ok(Math.max(...zs) - Math.min(...zs) > 5, "the preview has depth: the faces of the rim and the floors of the web");
});

test("Cut spokes in a thin disc is a flat wheel with the spokes cut out: no ratio of diameter to thickness is refused", () => {
  for (const thick of [1, 2.5]) {
    let s = createSession(kernel);
    const outer = drawCircle(scene(s), XY, [0, 0, 0], 30); s = run(s, outer.command);
    const hole = drawCircle(scene(s), XY, [0, 0, 0], 4); s = run(s, hole.command);
    s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [outer.circle], params: { depth: thick, ...figureParams([{ outer: [outer.circle], holes: [[hole.circle]] }]) } } } as Command);
    const body = bodiesOf({ session: s })[0]!, whole = body.volume;
    let st: ReturnType<typeof createState> = { ...createState(s), cam: homeCamera() };
    st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body.ref as never] } } };
    st = reduce(st, { type: "runAction", id: "model:wheelcut" }, env);
    assert.equal(modelTarget(scene(st.session), st.tool!)!.problem, null, `${thick} thick`);
    st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    let n = 0; while (st.building && n++ < 12) st = reduce(st, { type: "buildNext" }, env);
    assert.ok(!st.session.message, `${thick} thick: ${st.session.message}`);
    const after = bodiesOf(st);
    assert.equal(after.length, 1);
    assert.ok(after[0]!.volume < whole * 0.9, `${thick} thick: the cutouts take metal: ${after[0]!.volume.toFixed(0)} of ${whole.toFixed(0)}`);
    assert.ok(Math.abs(after[0]!.bbox.max[2]! - after[0]!.bbox.min[2]! - thick) < 1e-3, "as thick as it was");
  }
});
