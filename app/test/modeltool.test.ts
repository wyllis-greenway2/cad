// The tool that places a gear assembly model (`dec_gear_models`): the numbers it gets from an overall size and from what is typed, the picture it shows, and the model it makes where the picture stood.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { typeKey, finish, previewOf } from "../src/interaction/tools.ts";
import type { Tool } from "../src/interaction/tools.ts";
import { modelEntry, modelTarget } from "../src/interaction/modeltool.ts";
import { MODEL_KINDS, modelNumbers, modelExtent, modelStart, modelFields, modelProblem } from "../src/operation/modelkinds.ts";
import type { ModelKind } from "../src/operation/modelkinds.ts";

await kernel.init();
const XY = worldRef("XY"), XZ = worldRef("XZ");
type B = { bbox: { min: number[]; max: number[] } };
const bodies = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as B[];
const env = { w: 800, h: 600, now: 0 };
const armed = (kind: ModelKind): Tool => { const st = reduce({ ...createState(createSession(kernel)), cam: homeCamera() }, { type: "runAction", id: `model:${kind}` }, env as never); assert.equal(st.tool?.kind, "model"); return st.tool!; };
const typeIn = (t: Tool, field: number, text: string): Tool => { let u: Tool = { ...t, model: { ...t.model!, field } }; for (const k of text) u = typeKey(u, k); return u; };

test("the overall size grows every length that was not typed, and only those: the usual numbers at the usual size, the size asked for at any other", () => {
  for (const kind of MODEL_KINDS) {
    const usual = modelExtent(kind, modelStart(kind));
    for (const f of [0.5, 2]) {
      const n = modelNumbers(kind, {}, usual * f);
      assert.ok(Math.abs(modelExtent(kind, n) - usual * f) < 0.02 * usual * f, `${kind}: the size ${usual * f} is ${modelExtent(kind, n)}`);
      for (const fl of modelFields(kind)) if (!fl.scaled) assert.equal(n[fl.key], modelStart(kind)[fl.key], `${kind}: ${fl.key} is not a length of the thing and stays`);
    }
    assert.deepEqual(modelNumbers(kind, {}, undefined), modelStart(kind));
  }
  // a number typed is kept, and the others fit round it
  const n = modelNumbers("gearbox", { rod: 8 }, 100);
  assert.equal(n.rod, 8);
  assert.ok(Math.abs(modelExtent("gearbox", n) - 100) < 2, `${modelExtent("gearbox", n)}`);
});
test("a model's numbers that make none are said, with the reason, whatever the size", () => {
  assert.match(modelProblem("gearbox", modelNumbers("gearbox", { stages: 9 }, 80)) ?? "", /stages are from 1 to 4/);
  assert.equal(modelProblem("gearbox", modelNumbers("gearbox", {}, 150)), null);
  assert.equal(modelProblem("bearing", modelNumbers("bearing", {}, 40)), null);
  assert.equal(modelProblem("cycloidal", modelNumbers("cycloidal", {}, 150)), null);
});

test("the tool: armed from the ring item; after the first click a picture of the model stands there, sized by the box; Create makes it with its middle on the click, turned as asked", () => {
  let t = armed("bearing");
  assert.equal(t.points.length, 0);
  assert.equal(modelTarget(scene(createSession(kernel)), t), null, "nothing stands before the first click");
  t = { ...t, plane: XY, points: [[30, 20, 0]], cursor: [30, 20, 0] };
  const sc = scene(createSession(kernel));
  const usual = previewOf(sc, t)!;
  assert.ok(usual.segments.length > 100 && !usual.red, "the picture of the usual bearing");
  t = typeIn(t, 0, "50");
  assert.equal(modelEntry(sc, t)!.fields[0]!.value, "50");
  assert.ok(Math.abs(modelTarget(sc, t)!.size - 50) < 1, "the size typed is the size");
  const fin = finish(sc, t);
  assert.ok(fin);
  const s = run(createSession(kernel), fin!.command);
  assert.ok(!s.message, s.message ?? "");
  const bb = bodies(s).map((b) => b.bbox);
  const [lo, hi] = [0, 1, 2].map((k) => [Math.min(...bb.map((b) => b.min[k]!)), Math.max(...bb.map((b) => b.max[k]!))]) as [number, number][];
  assert.ok(Math.abs((lo![0]! + lo![1]!) / 2 - 30) < 0.3 && Math.abs((hi![0]! + hi![1]!) / 2 - 20) < 0.3, "the middle is on the click");
  assert.ok(Math.abs(lo![1]! - lo![0]! - 50) < 1, `50 across: ${lo![1]! - lo![0]!}`);
  assert.ok(Math.abs(bb.reduce((m, b) => Math.min(m, b.min[2]!), 99)) < 1e-6, "it stands on the plane");
});
test("the tool: a gearbox turned 90 degrees stands with its long side along the plane's second direction; on an upright plane it stands out from it", () => {
  const sc = scene(createSession(kernel));
  let t: Tool = { ...armed("gearbox"), plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0] };
  t = typeIn(typeIn(t, 0, "80"), 1, "90");
  const g = modelTarget(sc, t)!;
  assert.ok(Math.abs(g.place.ex[1] - 1) < 1e-9 && Math.abs(g.place.ey[0] + 1) < 1e-9, "x along y, y along -x");
  const made = run(createSession(kernel), finish(sc, t)!.command);
  assert.ok(!made.message, made.message ?? "");
  const wide = (k: number) => Math.max(...bodies(made).map((b) => b.bbox.max[k]!)) - Math.min(...bodies(made).map((b) => b.bbox.min[k]!));
  assert.ok(wide(1) > wide(0) * 1.3, `longer along y (${wide(1)}) than x (${wide(0)})`);
  // a bearing on the XZ plane: its axis is the plane's normal, so it is a few mm thick along y and its diameter along x and z
  const up = typeIn({ ...armed("bearing"), plane: XZ, points: [[0, 0, 0]], cursor: [0, 0, 0] }, 0, "22");
  const m2 = run(createSession(kernel), finish(sc, up)!.command);
  assert.ok(!m2.message, m2.message ?? "");
  const span = (k: number) => Math.max(...bodies(m2).map((b) => b.bbox.max[k]!)) - Math.min(...bodies(m2).map((b) => b.bbox.min[k]!));
  assert.ok(span(0) > 20 && span(2) > 20 && span(1) < 10, `${span(0)} ${span(1)} ${span(2)}`);
});
test("the tool: numbers that make no model show the picture in red and say why in the box, and Create refuses with the same words", () => {
  const sc = scene(createSession(kernel));
  const t = typeIn({ ...armed("gearbox"), plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0] }, 2, "9");
  assert.ok(previewOf(sc, t)!.red);
  assert.match(modelTarget(sc, t)!.problem ?? "", /stages/);
  assert.equal(finish(sc, t), null);
});

// ---- built a part at a time ----
import { modelBuild } from "../src/operation/modelkinds.ts";
import { AT_ORIGIN_FOR_TESTS } from "./helpers/modelplace.ts";
test("each model lists its parts, bottom up, covering every step once", () => {
  const want: Record<ModelKind, string[]> = {
    gearbox: ["Base plate and posts", "Rod 1", "Rod 2", "Rod 3", "Stage 1 pinion", "Stage 1 gear", "Stage 2 pinion", "Stage 2 gear", "Top plate"],
    bearing: ["Inner race", "Outer race", ...Array.from({ length: 7 }, (_, i) => `Ball ${i + 1}`)],
    differential: ["Cage", "Axle 1", "Axle 2", "Cross pin", "Side gear 1", "Spider gear 1", "Side gear 2", "Spider gear 2", "Cap 1", "Cap 2", "Drive gear"],
    cycloidal: ["Base plate and ring pins", "Input shaft and eccentric", "Cycloidal disc", "Output plate and pins"],
  };
  for (const kind of MODEL_KINDS) {
    const b = modelBuild(kind, modelStart(kind), AT_ORIGIN_FOR_TESTS);
    assert.ok(b.ok, b.ok ? "" : b.error);
    if (!b.ok) continue;
    assert.deepEqual(b.value.parts.map((p) => p.label), want[kind], kind);
    let at = 0;
    for (const p of b.value.parts) { assert.equal(p.from, at, `${kind}: ${p.label} follows the part before`); assert.ok(p.to > p.from); at = p.to; }
    assert.equal(at, b.value.steps.length, `${kind}: every step is in a part`);
  }
});
test("Create makes the model a part at a time: the first part at once, the next each time the kernel has answered; Esc stops and keeps what is made", () => {
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "model:bearing" }, env as never);
  st = { ...st, tool: { ...st.tool!, plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0] } };
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env as never);
  assert.ok(st.building, "building");
  assert.equal(st.tool, null);
  assert.equal(st.building!.next, 1, "the first part is made");
  assert.equal(bodies(st.session).length, 1);
  st = reduce(st, { type: "buildNext" }, env as never);
  assert.equal(bodies(st.session).length, 2, "the next part");
  // Esc stops it where it is
  const stopped = reduce(st, { type: "escape" }, env as never);
  assert.equal(stopped.building, null);
  assert.match(stopped.session.message ?? "", /stopped/);
  assert.equal(bodies(stopped.session).length, 2);
  // left to go on, it makes all nine bodies and lets go of the list
  let n = 0;
  while (st.building && n++ < 20) st = reduce(st, { type: "buildNext" }, env as never);
  assert.equal(st.building, null);
  assert.equal(bodies(st.session).length, 9);
  assert.equal(st.session.message ?? null, null);
});
