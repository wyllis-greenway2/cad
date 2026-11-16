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

import { requestOverlap } from "../src/interaction/overlap.ts";
test("the volume two bodies share, from the kernel: the common part of two blocks, none when they only touch", async () => {
  // A is 0..10 in x, B is 5..15: they share 5 x 10 x 10 = 500 mm3
  const into = two(0, true);
  const [a, b] = bodyRefs(into);
  const sc = scene(into);
  let done = 0;
  requestOverlap(kernel, sc, a!, b!, () => { done++; });
  let r = lines(measureReport(sc, [a!, b!]));
  assert.match(r["Between the two bodies|Shared volume"]!, /being worked out|mm³/);
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(done, 1);
  r = lines(measureReport(sc, [a!, b!]));
  assert.match(r["Between the two bodies|Shared volume"]!, /^500 mm³ \(0\.5 cm³\), 50 % of the smaller body$/);
  // asked again for the same scene and pair: not asked twice
  requestOverlap(kernel, sc, b!, a!, () => { done++; });
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(done, 1);
  // two bodies that are apart have no shared-volume line at all
  const apart = two(20);
  r = lines(measureReport(scene(apart), bodyRefs(apart)));
  assert.equal(r["Between the two bodies|Shared volume"], undefined);
});

// ---- the centre of mass (`in_574`) ----
import { massOf } from "../src/interaction/mass.ts";
test("the centre of mass: a block's is the middle of it, bodies together weigh by volume", () => {
  const s = block(10, 20, 30);
  const [b] = (Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: Ref }[]).map((x) => x.ref);
  const m = massOf(scene(s), b!)!;
  assert.ok(Math.abs(m.volume - 6000) < 1e-6, `volume from the mesh: ${m.volume}`);
  assert.deepEqual(m.centre.map((v) => Math.round(v * 1e6) / 1e6), [5, 10, 15]);
  assert.equal(lines(measureReport(scene(s), [b!]))["Body 1|Centre of mass"], "5, 10, 15 mm (as solid all through)");
  // two bodies: 1000 mm3 at x 5 and 3000 mm3 (30 x 10 x 10) at x 35 + 15... a 10 cube at 0..10 and a 10 x 10 x 30 block at 20..50, same y and z: together (1000*5 + 3000*35) / 4000 = 27.5
  let t = createSession(kernel);
  const a = drawRectangle(scene(t), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); t = run(t, a.command);
  t = run(t, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const c = drawRectangle(scene(t), XY, [20, 0, 0], [50, 10, 0], [1, 0, 0], [0, 1, 0]); t = run(t, c.command);
  t = run(t, { type: "addStep", step: { id: "s_101", type: "extrude", parts: c.lines, params: { depth: 10, mode: "new" } } } as never);
  const r = lines(measureReport(scene(t), []));
  assert.equal(r["The model|Centre of mass, all"], "27.5, 5, 5 mm");
  assert.equal(r["Body 1|Centre of mass"], "5, 5, 5 mm (as solid all through)");
  assert.equal(r["Body 2|Centre of mass"], "35, 5, 5 mm (as solid all through)");
});

test("a notch cut out moves the centre of mass away from it, and a round post's is on its axis", () => {
  let n = createSession(kernel);
  const base = drawRectangle(scene(n), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); n = run(n, base.command);
  n = run(n, { type: "addStep", step: { id: "s_100", type: "extrude", parts: base.lines, params: { depth: 10 } } } as never);
  const notch = drawRectangle(scene(n), XY, [0, 0, 0], [4, 10, 0], [1, 0, 0], [0, 1, 0]); n = run(n, notch.command);
  n = run(n, { type: "addStep", step: { id: "s_101", type: "extrude", parts: notch.lines, params: { depth: 5, mode: "cut" } } } as never);
  const nb = (Object.values(scene(n).parts).find((p) => p.kind === "body") as unknown as { ref: Ref });
  const nm = massOf(scene(n), nb.ref)!;
  assert.ok(Math.abs(nm.volume - 800) < 1e-6, `800 left: ${nm.volume}`);
  assert.deepEqual(nm.centre.map((v) => Math.round(v * 1e4) / 1e4), [5.75, 5, 5.625], "the centre has moved away from the notch");
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [3, 4, 0], 5); s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 10 } } } as never);
  const b = (Object.values(scene(s).parts).find((p) => p.kind === "body") as unknown as { ref: Ref });
  const m = massOf(scene(s), b.ref)!;
  assert.ok(Math.abs(m.centre[0] - 3) < 0.01 && Math.abs(m.centre[1] - 4) < 0.01 && Math.abs(m.centre[2] - 5) < 0.01, m.centre.join(", "));
  assert.ok(Math.abs(m.volume - Math.PI * 25 * 10) < 0.01 * Math.PI * 25 * 10, `a post's volume from its mesh, a little under the true one: ${m.volume}`);
});

// ---- wall thickness (`in_575`) ----
import { wallThickness } from "../src/operation/thickness.ts";
test("wall thickness: a block's thinnest wall is its smallest size, a thin plate and a thin-walled hollow are said to be too thin, a thick-walled hollow is not", () => {
  const body = (s: ReturnType<typeof block>) => (Object.values(scene(s).parts).find((p) => p.kind === "body") as unknown as { ref: Ref }).ref;
  const s0 = block(10, 20, 30);
  let r = lines(measureReport(scene(s0), [body(s0)]));
  assert.match(r["Body 1|Thinnest wall"]!, /^10 mm, near /);
  assert.match(r["Body 1|Under 0.8 mm"]!, /^none: every wall is at least 0\.8 mm/);
  const plate = block(20, 20, 0.5);
  r = lines(measureReport(scene(plate), [body(plate)]));
  assert.match(r["Body 1|Thinnest wall"]!, /^0\.5 mm, near /);
  assert.match(r["Body 1|Under 0.8 mm"]!, /^95\.24 % of the surface has less than 0\.8 mm behind it: too thin to print well/);
  const hollow = (wall: number) => {
    let s = block(20, 20, 20);
    s = run(s, { type: "addStep", step: { id: "s_101", type: "hollow", parts: [], params: { thickness: wall, mode: "closed" } } } as never);
    return s;
  };
  const thick = hollow(2);
  assert.equal(thick.message ?? null, null);
  r = lines(measureReport(scene(thick), [body(thick)]));
  assert.match(r["Body 1|Thinnest wall"]!, /^(2|1\.99|2\.01) mm/);
  assert.match(r["Body 1|Under 0.8 mm"]!, /^none/);
  const thin = hollow(0.5);
  r = lines(measureReport(scene(thin), [body(thin)]));
  assert.match(r["Body 1|Thinnest wall"]!, /^0\.5 mm/);
  assert.match(r["Body 1|Under 0.8 mm"]!, /% of the surface has less than 0\.8 mm/);
});

test("the wall check on raw triangles: a cube of 10 is 10 thick, and a body too detailed for the samples allowed is sampled and says so", () => {
  const cube: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => cube.push(...a, ...b, ...c, ...a, ...c, ...d);
  const P = (x: number, y: number, z: number) => [x * 10, y * 10, z * 10];
  quad(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)); // bottom, outward = -z
  quad(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1));
  quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1));
  quad(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1));
  quad(P(1, 1, 0), P(0, 1, 0), P(0, 1, 1), P(1, 1, 1));
  quad(P(0, 1, 0), P(0, 0, 0), P(0, 0, 1), P(0, 1, 1));
  const w = wallThickness(cube, 0.8)!;
  assert.ok(Math.abs(w.thinnest - 10) < 1e-3, `${w.thinnest}`);
  assert.equal(w.thinShare, 0);
  assert.equal(w.all, true);
  const few = wallThickness(cube, 0.8, 8)!;
  assert.equal(few.all, false);
});

// ---- the thin places are marked in the picture (`in_577`) ----
import { frameOf } from "../src/interaction/frame.ts";
import { thinPlacesOf } from "../src/interaction/measure.ts";
test("the places too thin to print are given as triangles to mark, only while the Measure tab is open", () => {
  const plate = block(20, 20, 0.5);
  const sc = scene(plate);
  const thin = thinPlacesOf(sc, [])!;
  assert.ok(thin && thin.length >= 9 * 4, `the two big faces: ${thin?.length}`);
  // every triangle marked lies in the top or the bottom of the plate (z = 0 or 0.5), none in an edge face
  for (let i = 0; i < thin.length; i += 9) for (let k = 0; k < 3; k++) assert.ok(Math.abs(thin[i + 3 * k + 2]!) < 1e-6 || Math.abs(thin[i + 3 * k + 2]! - 0.5) < 1e-6 );
  for (let i = 0; i < thin.length; i += 9) assert.ok([0, 1, 2].every((k) => Math.abs(thin[i + 3 * k + 2]! - thin[i + 2]!) < 1e-6), "a marked triangle is flat on the top or the bottom");
  assert.equal(thinPlacesOf(sc, []), thin, "the same list while nothing changes");
  // a block that is thick all through has nothing to mark
  assert.equal(thinPlacesOf(scene(block(10, 20, 30)), []), null);
  // the frame carries it only while the Measure tab is open
  let st = createState(plate);
  assert.equal(frameOf(st, { w: 800, h: 600 }).thin, null);
  st = reduce(st, { type: "panel", name: "measure" }, { w: 800, h: 600, now: 0 });
  assert.equal(frameOf(st, { w: 800, h: 600 }).thin?.length, thin.length);
  st = reduce(st, { type: "panel", name: "history" }, { w: 800, h: 600, now: 0 });
  assert.equal(frameOf(st, { w: 800, h: 600 }).thin, null);
});
