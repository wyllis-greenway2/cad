// The measure report (`dec_measure_report`, `in_567`): what the selection is, in numbers.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { measureReport } from "../src/interaction/measure.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { panelOf } from "../src/interaction/panels.ts";
import { settings } from "../src/shared/settings.ts";

await kernel.init();
const XY = worldRef("XY");
function block(w = 10, d = 20, h = 30) {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [w, d, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: h } } } as never);
  return s;
}
const lines = (sections: ReturnType<typeof measureReport>) => Object.fromEntries(sections.flatMap((x) => x.lines.map((l) => [`${x.title}|${l.label}`, l.value])));
const parts = (s: ReturnType<typeof block>) => Object.values(scene(s).parts);

test("nothing selected: the model's volume, weight, size and the body's counts", () => {
  const s = block();
  const r = lines(measureReport(scene(s), []));
  assert.equal(r["The model|Bodies"], "1");
  assert.equal(r["The model|Volume"], "6000 mm³ (6 cm³)");
  assert.equal(r["The model|Weight, solid"], `${Math.round(6 * settings.measure.densityGramsPerCm3 * 100) / 100} g at ${settings.measure.densityGramsPerCm3} g/cm³`);
  assert.equal(r["The model|Size, all together"], "10 × 20 × 30 mm (X × Y × Z)");
  assert.equal(r["Body 1|Surface area"], "2200 mm²", "2 (10x20) + 2 (10x30) + 2 (20x30)");
  assert.equal(r["Body 1|Made of"], "6 faces, 12 edges, 8 corners");
  assert.equal(r["Body 1|Middle of its box"], "5, 10, 15 mm");
});

test("empty model says so", () => {
  const r = measureReport(scene(createSession(kernel)), []);
  assert.match(r[0]!.title, /Nothing to measure/);
});

test("a face, two faces, an edge, two edges, a corner and two corners", () => {
  const s = block();
  const sc = scene(s);
  const planes = parts(s).filter((p) => p.kind === "plane" && p.origin === "body") as unknown as { ref: Ref; at: number[] }[];
  const top = planes.find((p) => Math.abs(p.at[2]! - 30) < 1e-6 && p.ref.includes("0,0,1"))!;
  const bottom = planes.find((p) => Math.abs(p.at[2]!) < 1e-6 && p.ref.includes("0,0,-1"))!;
  let r = lines(measureReport(sc, [top.ref]));
  assert.equal(r["Face|Area"], "200 mm²");
  assert.equal(r["Face|Tilt from level"], "0°");
  r = lines(measureReport(sc, [top.ref, bottom.ref]));
  assert.equal(r["Between the two faces|Distance"], "30 mm");
  assert.equal(r["Between the two faces|Angle"], "0°");
  const edges = parts(s).filter((p) => p.kind === "line" && p.origin === "body") as unknown as { ref: Ref; a: Ref; b: Ref }[];
  const at = (ref: Ref) => (sc.parts[ref] as unknown as { at: number[] }).at;
  const long = edges.find((e) => Math.abs(at(e.a)[2]! - at(e.b)[2]!) < 1e-9 && Math.abs(Math.abs(at(e.a)[1]! - at(e.b)[1]!) - 20) < 1e-9)!;
  const tall = edges.find((e) => Math.abs(Math.abs(at(e.a)[2]! - at(e.b)[2]!) - 30) < 1e-9)!;
  r = lines(measureReport(sc, [long.ref]));
  assert.equal(r["Edge|Length"], "20 mm");
  assert.equal(r["Edge|Tilt from level"], "0°");
  r = lines(measureReport(sc, [long.ref, tall.ref]));
  assert.equal(r["Edge 1|Length"], "20 mm");
  assert.equal(r["Edge 2|Length"], "30 mm");
  assert.equal(r["Edge 2|Tilt from level"], "90°");
  assert.equal(r["Between the two edges|Angle between them"], "90°");
  const corners = parts(s).filter((p) => p.kind === "corner" && p.origin === "body") as unknown as { ref: Ref; at: number[] }[];
  const c0 = corners.find((c) => c.at.every((v) => Math.abs(v) < 1e-9))!;
  const c1 = corners.find((c) => Math.abs(c.at[0]! - 10) < 1e-9 && Math.abs(c.at[1]! - 20) < 1e-9 && Math.abs(c.at[2]! - 30) < 1e-9)!;
  assert.equal(lines(measureReport(sc, [c1.ref]))["Corner|Position"], "10, 20, 30 mm");
  r = lines(measureReport(sc, [c0.ref, c1.ref]));
  assert.equal(r["Between the two corners|Distance"], `${Math.round(Math.hypot(10, 20, 30) * 100) / 100} mm`);
  assert.equal(r["Between the two corners|Along X, Y, Z"], "10, 20, 30 mm");
});

test("a round edge and a round wall: radius, diameter, and a curve's length", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 5); s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 10 } } } as never);
  const sc = scene(s);
  const rim = (Object.values(sc.parts).filter((p) => p.kind === "line" && p.origin === "body") as unknown as { ref: Ref; circle?: unknown }[]).find((l) => l.circle)!;
  const r = lines(measureReport(sc, [rim.ref]));
  assert.equal(r["Edge|Radius"], "5 mm");
  assert.equal(r["Edge|Diameter"], "10 mm");
  const len = parseFloat(r["Edge|Length along it"]!);
  assert.ok(len > 15 && len < 31.5, `half or the whole of a 31.4 mm circle: ${len}`);
  const wall = (Object.values(sc.parts).filter((p) => p.kind === "plane" && p.origin === "body") as unknown as { ref: Ref; curved?: unknown }[]).find((p) => p.curved)!;
  const w = lines(measureReport(sc, [wall.ref]));
  assert.equal(w["Face|Radius"], "5 °".replace(" °", " mm"));
});

test("the Measure tab, and the tape measure entry opens it", () => {
  let st = createState(block());
  st = reduce(st, { type: "panel", name: "measure" }, { w: 800, h: 600, now: 0 });
  const p = panelOf(st.panel, scene(st.session), [], {}, null, st.session.history, null)!;
  assert.equal(p.title, "Model");
  assert.deepEqual(p.tabs!.map((t) => t.label), ["Steps", "Bodies", "Sketches", "Constraints", "Parameters", "Measure"]);
  assert.ok(p.sections!.length >= 2 && p.sections![0]!.title === "The model");
  let st2 = createState(block());
  st2 = reduce(st2, { type: "runAction", id: "tape:measure" }, { w: 800, h: 600, now: 0 });
  assert.equal(st2.tape, true);
  assert.equal(st2.panel, "measure");
});

// ---- the clearance between two bodies (`in_568`) ----
function two(gap: number, overlap = false) {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const x = overlap ? 5 : 10 + gap;
  const b = drawRectangle(scene(s), XY, [x, 0, 0], [x + 10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
  return s;
}
const bodyRefs = (s: ReturnType<typeof two>) => (Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: Ref; id?: string }[]).map((b) => b.ref);

test("two bodies: the nearest distance between their surfaces, touching, and inside each other", () => {
  const apart = two(20);
  const [a, b] = bodyRefs(apart);
  assert.equal(bodyRefs(apart).length, 2);
  let r = lines(measureReport(scene(apart), [a!, b!]));
  const d = parseFloat(r["Between the two bodies|Nearest"]!);
  assert.ok(Math.abs(d - 20) < 0.01, `20 mm apart: ${d}`);
  assert.equal(r["Body 1|To Body 2"], r["Between the two bodies|Nearest"], "each body says how far the other is");
  const touch = two(0);
  r = lines(measureReport(scene(touch), bodyRefs(touch)));
  assert.match(r["Between the two bodies|Nearest"]!, /touching|^0 mm|^0\.0/);
  const into = two(0, true);
  r = lines(measureReport(scene(into), bodyRefs(into)));
  assert.equal(r["Between the two bodies|Overlap"], "they go into each other");
});

test("the clearance set for hard bodies is said to be met or not", () => {
  let s = two(0.3);
  s = run(s, { type: "setClearance", value: 0.5 } as never);
  let r = lines(measureReport(scene(s), bodyRefs(s)));
  assert.match(r["Between the two bodies|Nearest"]!, /less than the 0.5 mm clearance set/);
  s = run(s, { type: "setClearance", value: 0.2 } as never);
  r = lines(measureReport(scene(s), bodyRefs(s)));
  assert.match(r["Between the two bodies|Nearest"]!, /at least the 0.2 mm clearance set/);
});
