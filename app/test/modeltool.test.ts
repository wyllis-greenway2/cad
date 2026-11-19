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
    if (!modelFields(kind).some((f) => f.scaled)) continue; // (a catalogue bearing has one size: its number's)
    const usual = modelExtent(kind, modelStart(kind));
    for (const f of [0.5, 2]) {
      const n = modelNumbers(kind, {}, usual * f);
      const got = modelExtent(kind, n); // (a size too small for the rooms the printer needs is taken up to the nearest that can be made: never under)
      assert.ok(got >= usual * f * 0.98 && (got < usual * f * 1.02 || modelProblem(kind, modelNumbers(kind, {}, usual * f * 0.9)) === null || f < 1), `${kind}: the size ${usual * f} is ${got}`);
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
    ballbearing: ["Inner race", "Outer race", ...Array.from({ length: 7 }, (_, i) => `Ball ${i + 1}`)], // (the 608: seven balls)
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

// ---- Play ----
import { startPlain, followMatrix } from "../src/interaction/motion.ts";
import { animatedBodies, modelBody } from "../src/operation/gearcouple.ts";
import { discOutline } from "../src/operation/modelcycloidal.ts";
function buildAll(kind: ModelKind): ReturnType<typeof createState> {
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: `model:${kind}` }, env as never);
  st = { ...st, tool: { ...st.tool!, plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0] } };
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env as never);
  let n = 0;
  while (st.building && n++ < 40) st = reduce(st, { type: "buildNext" }, env as never);
  assert.equal(st.building, null, `${kind} is built`);
  return st;
}
const apply4 = (m: number[], p: readonly number[]): number[] => [m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!, m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!, m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!];
test("a finished model keeps how it moves, and Play from any part of it plays the whole: the gearbox's stages turn the other way by the teeth", () => {
  const st = buildAll("gearbox");
  const sc = scene(st.session);
  assert.equal(sc.models?.length, 1);
  const rec = sc.models![0]!;
  assert.deepEqual(Object.keys(rec.parts).length, 9);
  const anim = animatedBodies(sc);
  const all = Object.values(sc.parts).filter((p) => p.kind === "body").map((p) => p.ref);
  const driverBody = anyBodyOf(sc, rec.parts["Rod 1"]!);
  assert.ok(all.every((b) => anim.get(b) !== undefined), "every body of the model has a Play");
  // played from the top plate, or a gear on the far rod: it is the first pinion that is the driver, and everything that turns turns
  for (const part of ["Top plate", "Stage 2 gear", "Rod 3"]) {
    const from = rec.parts[part]!;
    const r = startPlain(sc, from.gear ? (Object.values(sc.parts).find((b) => b.kind === "body" && anim.get(b.ref) !== undefined && b.ref !== driverBody && anyBodyOf(sc, from) === b.ref) ?? { ref: all[0]! }).ref : anyBodyOf(sc, from));
    assert.ok(r.ok, r.ok ? "" : r.why);
    if (r.ok) assert.equal(r.motion.follows.length, Object.keys(rec.parts).length - 2 - 1, `${part}: everything but the two plates and the driver moves (the gears, and the rods and pinions glued to them)`);
  }
  const byPart = Object.fromEntries(rec.followers.map((f) => [f.part, f.k]));
  assert.ok(Math.abs(byPart["Stage 1 gear"]! - -1 / 3) < 1e-9, "the first gear turns a third as fast the other way");
  assert.equal(byPart["Stage 2 pinion"], undefined, "the next pinion is glued to the gear's rod: it is not a follower of its own");
  assert.equal(sc.glue?.length, 3, "a group for each rod: the rod, the gear on it and the pinion on it");
  assert.ok(Math.abs(byPart["Stage 2 gear"]! - 1 / 9) < 1e-9, "the last gear turns a ninth as fast, the same way");
});
test("the bearing's balls go round at about half the speed of the inner race, the outer race held", () => {
  const st = buildAll("bearing");
  const sc = scene(st.session);
  const rec = sc.models![0]!;
  assert.equal(rec.followers.length, 7);
  const f = rec.followers[0]!;
  assert.ok(f.after && f.after.k > 0.3 && f.after.k < 0.5, `${f.after?.k}`);
  assert.ok(!rec.followers.some((x) => x.part === "Outer race"), "the outer race is held");
  // a quarter turn of the inner race: the first ball's middle goes round by that times the orbit
  const mot = startPlain(sc, anyBodyOf(sc, rec.parts["Ball 1"]!))!;
  assert.ok(mot.ok);
  if (!mot.ok) return;
  const ball = mot.motion.follows[0]!;
  const to = apply4(followMatrix(ball, 90), ball.point);
  const ang = Math.atan2(to[1]! - ball.after!.point[1], to[0]! - ball.after!.point[0]) - Math.atan2(ball.point[1] - ball.after!.point[1], ball.point[0] - ball.after!.point[0]);
  assert.ok(Math.abs(ang - (ball.after!.k * Math.PI) / 2) < 1e-6, `${ang}`);
});
const anyBodyOf = (sc: ReturnType<typeof scene>, p: { step?: string; gear?: string }) => { const rec = sc.models!.find((m) => Object.values(m.parts).includes(p))!; const part = Object.keys(rec.parts).find((k) => rec.parts[k] === p)!; return modelBody(sc, rec, part)!; };
test("the differential: with axle 2 held and the cage turned, axle 1 turns twice as fast and each spider spins as the bevel pair's no-slip condition says", () => {
  const sc = scene(buildAll("differential").session);
  const rec = sc.models![0]!, k = Object.fromEntries(rec.followers.map((f) => [f.part, f]));
  assert.equal(k["Side gear 1"]!.k + 0, 2);
  assert.ok(!k["Side gear 2"], "side gear 2 is held");
  const spin = k["Spider gear 1"]!.k;
  assert.ok(Math.abs(spin - 16 / 10) < 1e-9 && Math.abs(k["Spider gear 2"]!.k + 16 / 10) < 1e-9);
  // the contact line of the side gear on -x and the spider on +y runs from the apex at the angle delta of the side gear's cone from its axis; the difference of the two turns, as vectors, lies along it
  const delta = Math.atan2(16, 10);
  const w = 1, rel1 = [w, 0], relSpider = [0, spin * w]; // (the side gear's turn about x and the spider's about y, relative to the cage, for a turn w of the cage)
  const diff = [rel1[0]! - relSpider[0]!, rel1[1]! - relSpider[1]!], line = [-Math.cos(delta), Math.sin(delta)];
  assert.ok(Math.abs(diff[0]! * line[1]! - diff[1]! * line[0]!) < 1e-9, "no slip at the contact line");
});
test("the cycloidal drive moved by Play: the disc's middle goes round the shaft, the disc itself turns the other way a ninth as fast, the output plate with it, and the disc clears every ring pin at every turn", () => {
  const sc = scene(buildAll("cycloidal").session);
  const rec = sc.models![0]!, d = modelStart("cycloidal");
  const disc = rec.followers.find((f) => f.part === "Cycloidal disc")!, out = rec.followers.find((f) => f.part === "Output plate and pins")!;
  const move = (f: typeof disc, a: number) => followMatrix({ gear: "", body: "d/x" as never, kind: "turn", point: f.point, dir: f.dir, k: f.k, ...(f.after ? { after: f.after } : {}) }, a);
  // the orientation of the disc after a turn of the input: the turn of a vector along its x axis
  const turnOf = (m: number[]): number => Math.atan2(m[1]!, m[0]!);
  for (const a of [10, 90, 200, 350]) {
    assert.ok(Math.abs(wrap(turnOf(move(disc, a)) - (-(a * Math.PI) / 180 / (d.pins! - 1)))) < 1e-9, `the disc has turned ${turnOf(move(disc, a))} at ${a} degrees`);
    assert.ok(Math.abs(wrap(turnOf(move(out, a)) - (-(a * Math.PI) / 180 / (d.pins! - 1)))) < 1e-9, "the output plate turns as the disc does");
    const c = apply4(move(disc, a), disc.point);
    assert.ok(Math.abs(Math.hypot(c[0]!, c[1]!) - d.ecc!) < 1e-9 && Math.abs(wrap(Math.atan2(c[1]!, c[0]!) - (a * Math.PI) / 180)) < 1e-9, "its middle goes round on the eccentric by the input's turn");
  }
  // and the lobes clear the pins as it moves: the disc's outline moved by the motion's matrices, against each ring pin's middle
  const out2 = discOutline(d as never, 20 * (d.pins! - 1)).map(([x, y]) => [x + d.ecc!, y]);
  const inside = (q: number[], poly: number[][]): boolean => { let r = false; for (let i = 0; i < poly.length; i++) { const [p1, p2] = [poly[i]!, poly[(i + 1) % poly.length]!]; if ((p1[1]! > q[1]!) !== (p2[1]! > q[1]!) && q[0]! < p1[0]! + ((q[1]! - p1[1]!) / (p2[1]! - p1[1]!)) * (p2[0]! - p1[0]!)) r = !r; } return r; };
  const near = (q: number[], poly: number[][]): number => Math.min(...poly.map((p1, i) => { const p2 = poly[(i + 1) % poly.length]!, [dx, dy] = [p2[0]! - p1[0]!, p2[1]! - p1[1]!], t = Math.max(0, Math.min(1, ((q[0]! - p1[0]!) * dx + (q[1]! - p1[1]!) * dy) / (dx * dx + dy * dy))); return Math.hypot(q[0]! - p1[0]! - t * dx, q[1]! - p1[1]! - t * dy); }));
  let least = Infinity;
  for (let a = 0; a < 360; a += 7) {
    const m = move(disc, a), world = out2.map((p) => apply4(m, [p[0]!, p[1]!, 0]));
    for (let k = 0; k < d.pins!; k++) {
      const q = [d.circle! * Math.cos((2 * Math.PI * k) / d.pins!), d.circle! * Math.sin((2 * Math.PI * k) / d.pins!)];
      assert.ok(!inside(q, world), `a ring pin is inside the disc at ${a} degrees`);
      least = Math.min(least, near(q, world) - d.pin! / 2);
    }
  }
  assert.ok(least > 0 && least < d.play! + 0.05, `the disc runs ${least} mm from the pins (the room is ${d.play})`);
  assert.ok(!rec.followers.some((f) => f.part === "Base plate and ring pins"), "the base is held");
});
const wrap = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));
test("the Play item of the ring starts the model from whichever of its bodies is selected, and the motion moves the model's own parts", () => {
  for (const [kind, from] of [["bearing", "Ball 3"], ["ballbearing", "Ball 5"], ["gearbox", "Top plate"], ["differential", "Cap 2"], ["cycloidal", "Output plate and pins"]] as [ModelKind, string][]) {
    let st = buildAll(kind);
    const sc = scene(st.session), rec = sc.models![0]!;
    const body = anyBodyOf(sc, rec.parts[from]!);
    st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body] } } };
    const played = reduce(st, { type: "runAction", id: "motion:play" }, env as never);
    assert.ok(played.motion, `${kind}: Play from ${from} starts a motion: ${played.session.message ?? ""}`);
    if (!played.motion) continue;
    const held: Record<ModelKind, number> = { gearbox: 2, ballbearing: 1, bearing: 1, differential: 2, cycloidal: 1 };
    assert.equal(played.motion.follows.length, Object.keys(rec.parts).length - held[kind] - 1, `${kind}: every moving part follows (the followers and what is glued to them)`);
    const driverBody = anyBodyOf(sc, rec.parts[rec.driver.part]!);
    assert.equal(played.motion.body, driverBody, `${kind}: the driver is ${rec.driver.part}`);
  }
});

// ---- what the human found (`in_1130`): a first click that went to size 0 with an error, and a module that did not carry the rest ----
test("a length typed sets the scale of the lengths not typed: a module of 1 where 1.5 is usual shrinks the rod, the plate and the rest by the same third", () => {
  const n = modelNumbers("gearbox", { module: 1 }, undefined), usual = modelStart("gearbox");
  assert.equal(n.module, 1);
  assert.ok(Math.abs(n.rod! - usual.rod! * (1 / 1.5)) < 0.01 && Math.abs(n.plate! - usual.plate! / 1.5) < 0.01 && Math.abs(n.width! - usual.width! / 1.5) < 0.01);
  assert.equal(n.fit, usual.fit, "the rooms for the printer stay");
  assert.equal(modelProblem("gearbox", n), null);
  const d = modelNumbers("differential", { module: 1 }, undefined);
  assert.ok(Math.abs(d.axle! - 2.5) < 0.01 && Math.abs(d.pin! - 2) < 0.01, `${d.axle} ${d.pin}`);
  assert.equal(modelProblem("differential", d), null, "the differential at module 1 is a differential");
});
test("whatever size the pointer asks for, from the first moment on, the numbers make a model (a tiny size is taken up to the nearest that can be made)", () => {
  for (const kind of MODEL_KINDS) {
    const usual = modelExtent(kind, modelStart(kind));
    for (const f of [0.01, 0.1, 0.25, 0.5, 3, 20]) {
      const n = modelNumbers(kind, {}, usual * f);
      assert.equal(modelProblem(kind, n), null, `${kind} at ${f} of its usual size: ${modelProblem(kind, n)}`);
      assert.ok(modelExtent(kind, n) > 0);
    }
  }
  // the tool: the pointer a hair from the click (the first moment) gives a model, not a refusal, for the differential the human saw
  const sc = scene(createSession(kernel));
  const t: Tool = { ...armed("differential"), plane: XY, points: [[0, 0, 0]], cursor: [0.5, 0.2, 0] };
  const g = modelTarget(sc, t)!;
  assert.equal(g.problem, null);
  assert.ok(g.size > 0);
});

// ---- glue (`in_1146`) ----
import { addGlue, removeGlue, glueOf } from "../src/operation/glue.ts";
import { toJSON, fromJSON } from "../src/operation/scene.ts";
test("glue: groups grow together, a body leaves its group, a group of one is no group, unknown bodies and a single body are refused, and it is saved with the project", () => {
  const sc = scene(buildAll("bearing").session);
  const ids = Object.values(sc.parts).filter((p) => p.kind === "body").map((p) => (p as { id: string }).id);
  const one = addGlue(sc, [ids[0]!, ids[1]!]);
  assert.ok(one.ok);
  if (!one.ok) return;
  const two = addGlue(one.value, [ids[1]!, ids[2]!]);
  assert.ok(two.ok);
  if (!two.ok) return;
  assert.deepEqual(two.value.glue![0]!.bodies.slice().sort(), [ids[0]!, ids[1]!, ids[2]!].sort(), "a body already in a group brings the group in");
  assert.equal(two.value.glue!.length, 1);
  const out = removeGlue(two.value, ids[0]!);
  assert.ok(out.ok && out.value.glue![0]!.bodies.length === 2 && !glueOf(out.value, ids[0]!));
  if (out.ok) { const gone = removeGlue(out.value, ids[1]!); assert.ok(gone.ok && gone.value.glue === undefined, "a group of one is no group"); }
  assert.ok(!addGlue(sc, [ids[0]!]).ok && !addGlue(sc, [ids[0]!, "x_nothing"]).ok);
  assert.deepEqual(fromJSON(toJSON(two.value)).glue, two.value.glue, "saved and read back");
});
test("glue: a body glued to a part that moves moves with it, however it was chosen to play; Unglue takes it out; the ring items say what they need", () => {
  let st = buildAll("gearbox");
  const sc = scene(st.session), rec = sc.models![0]!;
  const rod2 = modelBody(sc, rec, "Rod 2")!, gear1 = modelBody(sc, rec, "Stage 1 gear")!, plate = modelBody(sc, rec, "Base plate and posts")!;
  assert.ok(glueOf(sc, (sc.parts[rod2] as { id: string }).id), "the model glued its rod to its gear");
  const before = startPlain(sc, gear1);
  assert.ok(before.ok);
  if (!before.ok) return;
  assert.ok(before.motion.follows.some((f) => f.body === rod2), "the rod goes with the gear");
  // a held plate glued to the gear is carried along too
  const idPlate = (sc.parts[plate] as { id: string }).id, idGear = (sc.parts[gear1] as { id: string }).id;
  const g2 = addGlue(sc, [idPlate, idGear]);
  assert.ok(g2.ok);
  if (!g2.ok) return;
  const withPlate = startPlain(g2.value, gear1);
  assert.ok(withPlate.ok && withPlate.motion.follows.some((f) => f.body === plate), "so is a body glued to it afterwards");
  // the rod alone (a plain body, no pivot, no gear) is played from the gear it is glued to
  const fromRod = startPlain(sc, rod2);
  assert.ok(fromRod.ok && fromRod.motion.body !== rod2, "played from the rod: the driver is a part of its group that can be played");
  // the ring: Glue needs two bodies, Unglue a glued one; each does it
  const ring = (state: typeof st) => reduce(state, { type: "menu", x: 400, y: 300, button: true }, env as never).menu!.items.flatMap((i: any) => (i.children ?? []).flatMap((c: any) => [c, ...(c.children ?? [])]));
  const sel = (state: typeof st, refs: string[]) => ({ ...state, session: { ...state.session, click: { ...state.session.click, selection: refs as never } } });
  const none = ring(sel(st, [])).find((i: any) => i.id === "motion:glue");
  assert.ok(none && !none.enabled && /two bodies/.test(none.why ?? ""));
  const two = ring(sel(st, [plate, gear1])).find((i: any) => i.id === "motion:glue");
  assert.ok(two.enabled);
  const glued = reduce(sel(st, [plate, gear1]), { type: "runAction", id: "motion:glue" }, env as never);
  assert.ok(glueOf(scene(glued.session), idPlate), "Glue glued them");
  const un = reduce(sel(glued, [plate]), { type: "runAction", id: "motion:unglue" }, env as never);
  assert.ok(!glueOf(scene(un.session), idPlate), "Unglue took the plate out");
});

// ---- what the human asked (`in_1145`, `in_1153`): a bearing that loads with its constraints, so things can be driven on it ----
test("a bearing loads with its outer ring held and its inner ring turning about the axis (a pivot), and Play still turns the balls with the inner ring", () => {
  for (const kind of ["ballbearing", "bearing"] as ModelKind[]) {
    const st = buildAll(kind), sc = scene(st.session), rec = sc.models![0]!;
    const idOf = (part: string): string => { const b = Object.values(sc.parts).find((p) => p.kind === "body" && p.id !== undefined && (p as { id: string }).id === `x_${rec.parts[part]!.step}`); assert.ok(b, `${kind}: ${part}`); return (b as unknown as { id: string }).id; };
    assert.deepEqual(sc.fixed, [idOf("Outer race")], `${kind}: only the outer ring is held`);
    assert.equal(sc.pivots?.length, 1);
    assert.equal(sc.pivots![0]!.body, idOf("Inner race"));
    assert.ok(Math.abs(Math.abs(sc.pivots![0]!.dir[2]) - 1) < 1e-9, `${kind}: the axis is the bearing's`);
    assert.ok(Math.hypot(sc.pivots![0]!.point[0], sc.pivots![0]!.point[1]) < 1e-9);
  }
});
