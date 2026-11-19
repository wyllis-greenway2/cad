import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";
import { loopPoints } from "../src/operation/part.ts";
import type { CamSpec } from "../src/operation/cams.ts";
import { camShapes } from "../src/operation/cams.ts";
import { genevaCentres, genevaDefaultPin, genevaWheelRadius, outlinePoints, smoothUnder } from "../src/operation/geneva.ts";
import { splinePoints } from "../src/operation/spline.ts";
import { camFace, camRefs } from "../src/operation/camscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { armCam, typeKey, finish, camSpecOf } from "../src/interaction/tools.ts";
import type { Tool } from "../src/interaction/tools.ts";

await kernel.init();
const XY = worldRef("XY");
const spec = (over: Partial<CamSpec> = {}): CamSpec => ({ kind: "geneva", teeth: 4, diameter: 20, crank: 10, pin: 2.5, clearance: 0.3, hole: 2.5, lock: 0, lift: 0, ...over });
const volume = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const make = (sp: CamSpec) => {
  const rec = { id: "g_001", plane: XY, at: [0, 0, 0] as [number, number, number], spec: { teeth: 1, module: 1, cam: sp } };
  const s = run(createSession(kernel), { type: "gear", ...rec });
  assert.ok(!s.message, s.message ?? "");
  return { s, rec };
};
const area = (pts: readonly (readonly number[])[]): number => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]!; a += p[0]! * q[1]! - q[0]! * p[1]!; }); return Math.abs(a) / 2; };

test("the centre distance is the crank radius over the sine of half a step: the pin enters each slot straight", () => {
  for (const n of [3, 4, 5, 6, 8, 12]) {
    const [a, c] = [10, genevaCentres(n, 10)];
    assert.ok(Math.abs(c * Math.sin(Math.PI / n) - a) < 1e-12);
    // the angle at the pin between the crank's centre and the wheel's centre is a right angle when the pin enters (a, b and c make a right triangle)
    const b = c * Math.cos(Math.PI / n);
    assert.ok(Math.abs(a * a + b * b - c * c) < 1e-9, `n=${n}`);
  }
  assert.ok(Math.abs(genevaCentres(4, 10) - 14.142135623730951) < 1e-12);
});

test("the drive works: over the engagement the pin stays in its slot, and the wheel turns exactly one step", () => {
  for (const n of [4, 5, 6, 8]) {
    const [a, p, clr] = [10, 2.5, 0.3];
    const c = genevaCentres(n, a);
    const beta = Math.PI / 2 - Math.PI / n; // the crank's turn each side of the line of centres while the pin is in the slot
    const pin = (al: number): [number, number] => [c - a * Math.cos(al), a * Math.sin(al)];
    const turnAt = (al: number) => { const [x, y] = pin(al); return Math.atan2(y, x); }; // the wheel's turn: the slot's axis points at the pin
    assert.ok(Math.abs(turnAt(beta) - turnAt(-beta) - (2 * Math.PI) / n) < 1e-9, `one step, n=${n}`);
    const sh = camShapes(spec({ teeth: n }));
    assert.ok(sh.ok, sh.ok ? "" : (sh as { error: string }).error);
    const rw = c * Math.cos(Math.PI / n) + p; // the wheel's radius
    for (let k = 0; k <= 20; k++) {
      const al = -beta + (2 * beta * k) / 20;
      const [x, y] = pin(al);
      const dist = Math.hypot(x, y);
      assert.ok(dist >= c - a - 1e-9 && dist <= c * Math.cos(Math.PI / n) + 1e-9, "the pin is between its nearest approach and where it enters");
      assert.ok(dist + p / 2 + clr <= rw + 1e-9 || dist <= rw, "inside the wheel's rim");
    }
    void clr;
  }
});

test("the wheel has a slot for each step, and extrudes to the disc less the slots and the shaft's hole", () => {
  const { s, rec } = make(spec());
  const refs = camRefs(rec);
  assert.equal(refs.lines.length, 16, "four sides to each of four slots");
  assert.ok(refs.bore);
  const face = camFace(rec)!;
  const f = scene(s).parts[face as never] as unknown as { loop: string[]; corners: string[] };
  const outline = loopPoints((r) => scene(s).parts[r], f.loop as never, f.corners as never);
  const op = startOp(scene(s), [face as never], "extrude");
  assert.ok(op.ok, JSON.stringify(op));
  const made = runOp(s, { ...(op as { op: Op }).op, value: 3 })!.session;
  assert.ok(!made.message, made.message ?? "");
  const want = (area(outline) - Math.PI * 1.25 ** 2) * 3; // (the shaft's hole: diameter 2.5)
  assert.ok(Math.abs(volume(made) - want) / want < 0.005, `${volume(made)} vs ${want}`);
  // the disc less four slots: w = 2.5 + 0.6 wide, from the rounded end at 4.14 out to the rim
  const rw = genevaWheelRadius(4, 10, 2.5, 0.3);
  const [w, sm, sc] = [3.1, Math.sqrt(rw * rw - 3.1 ** 2 / 4), 14.142135623730951 - 10];
  const slot = w * (sm - sc) + (Math.PI * (w / 2) ** 2) / 2;
  assert.ok(Math.abs(area(outline) - (Math.PI * rw * rw - 4 * slot)) / area(outline) < 0.02, `${area(outline)}`);
});

test("the crank is drawn below the wheel, with a hub, an arm as wide as the pin and the pin's circle; both have their shaft's hole", () => {
  const sh = camShapes(spec());
  assert.ok(sh.ok && sh.value.polys?.length === 2 && sh.value.circles.length === 2);
  const crank = sh.value.polys![1]!;
  const rwd = genevaWheelRadius(4, 10, 2.5, 0.3);
  assert.ok(crank.points.every((q) => q[1] < -rwd), "below the wheel's rim");
  const hub = sh.value.circles[1]!;
  assert.ok(hub.c[0] === 0 && hub.c[1] < -rwd && hub.hole);
  const { s } = make(spec());
  assert.equal(Object.values(scene(s).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length, 2, "two figures: the wheel and the crank");
});

test("what cannot be made says why: the number of slots, a slot into the shaft's hole, slots that meet, a pin as wide as the circle", () => {
  const why = (o: Partial<CamSpec>) => String((camShapes(spec(o)) as { error?: string }).error);
  assert.match(why({ teeth: 2 }), /3 to 24/);
  assert.match(why({ hole: 8 }), /shaft/);
  assert.match(why({ teeth: 3, pin: 6 }), /reach|meet/);
  assert.match(why({ pin: 20 }), /pin/);
});

test("the tool: slots, crank, pin, clearance, hole and lock; the title says how far apart the shafts are; the numbers can be edited", async () => {
  const s = createSession(kernel);
  let t: Tool = { ...armCam("geneva"), plane: XY, points: [[0, 0, 0]], cursor: [10, 0, 0] };
  const sp0 = camSpecOf(t)!;
  assert.deepEqual([sp0.teeth, sp0.crank, sp0.pin, sp0.clearance, sp0.hole, sp0.lock], [4, 10, 2.5, 0.3, -1, undefined]);
  for (const k of ["6", "Tab", "1", "2"]) t = typeKey(t, k);
  assert.deepEqual([camSpecOf(t)!.teeth, camSpecOf(t)!.crank], [6, 12]);
  const fin = finish(scene(s), t);
  assert.ok(fin);
  const made = run(s, fin!.command);
  assert.equal(Object.values(scene(made).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length, 3, "the wheel, the crank and the locking disc");
  const { entryOf } = await import("../src/interaction/entry.ts");
  const e = entryOf(scene(s), t, null)!;
  assert.match(e.panel!, /Geneva wheel and crank, shafts 24 mm apart/); // 12 / sin(30 degrees) = 24
  assert.deepEqual(e.fields.map((f) => f.label), ["Slots", "Crank", "Pin", "Clearance", "Hole", "Lock"]);
  // edited: the numbers as they are, an automatic hole and lock left empty so they stay automatic
  const { editCamTool } = await import("../src/interaction/tools.ts");
  const rec = scene(made).gears![0]!;
  const et = editCamTool(rec);
  assert.deepEqual(et.cam!.typed, ["6", "12", String(Math.round(genevaDefaultPin(6, 12) * 100) / 100), "0.3", "", ""]);
  void loopFaceRef;
});

// ---- the locking disc (`in_788`)
type Pt = [number, number];
const turned = (poly: Pt[], a: number): Pt[] => poly.map(([x, y]): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
const crossing = (p: Pt, q: Pt, r: Pt, s2: Pt): boolean => { const o = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return o(p, q, r) * o(p, q, s2) < 0 && o(r, s2, p) * o(r, s2, q) < 0; };
const inside = (poly: Pt[], q: Pt): boolean => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = [poly[i]!, poly[j]!]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const overlap = (a: Pt[], b: Pt[]): boolean => a.some((p, i) => b.some((q, j) => crossing(p, a[(i + 1) % a.length]!, q, b[(j + 1) % b.length]!))) || a.some((p) => inside(b, p)) || b.some((p) => inside(a, p));
/** the wheel and the locking disc as polygons, and the disc's own, from the shapes of a drive */
function drive(sp: CamSpec) {
  const sh = camShapes(sp);
  assert.ok(sh.ok, sh.ok ? "" : (sh as { error: string }).error);
  const wheel = outlinePoints(sh.value.polys![0]!.points, sh.value.polys![0]!.bulges) as Pt[];
  const ring = sh.value.rings![0]!.map((q): [number, number, number] => [q[0], q[1], 0]);
  const n = ring.length;
  const disc = splinePoints([...ring, ring[0]!], 16, { before: ring[n - 1]!, after: ring[1]! }).map((q): Pt => [q[0], q[1]]);
  const centre = sh.value.circles[2]!.c as Pt; // (the disc's shaft: its hole)
  return { wheel, local: disc.map(([x, y]): Pt => [x - centre[0], y - centre[1]]) };
}

test("the locking disc keeps the wheel still between visits and lets it turn during one: no overlap all the way round, and a turn either way is blocked", () => {
  for (const [n, a] of [[4, 20], [5, 20], [6, 20]] as const) {
    const sp = spec({ teeth: n, crank: a, pin: a / 4, diameter: 2 * a, hole: -1, lock: undefined });
    const { wheel, local } = drive(sp);
    const c = genevaCentres(n, a);
    const beta = Math.PI / 2 - Math.PI / n;
    const placed = (al: number): Pt[] => turned(local, Math.PI - al).map(([x, y]): Pt => [x + c, y]); // the disc turned with the crank
    let worst = 0;
    for (let k = 0; k < 360; k++) {
      const al = ((k / 360) * 2 * Math.PI + Math.PI) % (2 * Math.PI) - Math.PI; // the crank angle, -180 to 180 degrees
      const inWindow = Math.abs(al) <= beta;
      const turn = inWindow ? Math.atan2(a * Math.sin(al), c - a * Math.cos(al)) : Math.PI / n; // (the wheel's turn: the pin's, or where the visit left it)
      assert.ok(!overlap(turned(wheel, turn), placed(al)), `n=${n}: the wheel and the disc meet at crank angle ${((al * 180) / Math.PI).toFixed(0)}`);
      worst = Math.max(worst, k);
    }
    // locked: well away from the pin's visit, a turn of 3 degrees either way runs the wheel into the disc
    for (const al of [Math.PI, Math.PI - 0.3, -Math.PI + 0.3]) for (const dt of [-0.05, 0.05]) assert.ok(overlap(turned(wheel, Math.PI / n + dt), placed(al)), `n=${n}: a turn of ${dt} at ${al} is not blocked`);
    void worst;
  }
});

test("the locking disc is a face of its own, with its shaft's hole; Lock 0 has none, and the wheel's rim is plain round", () => {
  const withDisc = make(spec({ teeth: 5, crank: 20, pin: 5, diameter: 40, hole: -1, lock: undefined })).s;
  const faces = (st: ReturnType<typeof createSession>) => Object.values(scene(st).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length;
  assert.equal(faces(withDisc), 3, "the wheel, the crank and the locking disc");
  const without = make(spec({ teeth: 5, crank: 20, pin: 5, diameter: 40, hole: -1, lock: 0 })).s;
  assert.equal(faces(without), 2);
  const wheelOnly = camShapes(spec({ lock: 0 }));
  const withArcs = camShapes(spec({ lock: undefined, hole: -1, crank: 20, pin: 5, diameter: 40 }));
  assert.ok(wheelOnly.ok && withArcs.ok);
  assert.ok(withArcs.value.polys![0]!.points.length > wheelOnly.value.polys![0]!.points.length, "the locking arcs add corners to the wheel");
});

test("what a locking disc cannot be says why, and an automatic hole is as big as the room allows", () => {
  const e = (o: Partial<CamSpec>) => String((camShapes(spec({ crank: 20, pin: 5, diameter: 40, hole: -1, lock: undefined, ...o })) as { error?: string }).error);
  assert.match(e({ lock: 1 }), /locking disc/);
  assert.match(e({ lock: 60 }), /locking disc/);
  const auto = camShapes(spec({ teeth: 4, crank: 20, pin: 5, diameter: 40, hole: -1, lock: undefined }));
  assert.ok(auto.ok);
  assert.ok(Math.abs(auto.value.circles[0]!.r * 2 - 5) < 1e-6, "a quarter of the crank radius, where the room allows");
  assert.match(e({ hole: 20 }), /hole/);
});

// ---- the quick picture while a number is typed (`in_789`)
import { camShapesQuick } from "../src/operation/cams.ts";
import { previewOf } from "../src/interaction/tools.ts";

test("the quick shapes have the same wheel and crank as the real ones, a plain circle for the locking disc, and take a fraction of the time", () => {
  const sp = spec({ teeth: 8, crank: 20, pin: 3, diameter: 40, hole: -1, lock: undefined, clearance: 0.31 }); // (numbers no other test used: nothing is kept for them yet)
  const t0 = performance.now();
  const quick = camShapesQuick(sp);
  const tq = performance.now() - t0;
  const t1 = performance.now();
  const full = camShapes(sp);
  const tf = performance.now() - t1;
  assert.ok(quick.ok && full.ok);
  assert.deepEqual(quick.value.polys, full.value.polys, "the wheel and the crank are the same");
  assert.equal(quick.value.rings![0]!.length, 48, "the disc is a circle of 48 points");
  const [cx, cy] = [quick.value.rings![0]!.reduce((s, q) => s + q[0], 0) / 48, quick.value.rings![0]!.reduce((s, q) => s + q[1], 0) / 48];
  const radii = quick.value.rings![0]!.map((q) => Math.hypot(q[0] - cx, q[1] - cy));
  assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-9);
  assert.ok(tq * 5 < tf, `quick ${tq.toFixed(0)} ms, real ${tf.toFixed(0)} ms`);
});

test("the tool's picture uses the quick shapes: a number typed makes a picture without working out the notch; Enter still makes the real drive", () => {
  const s = createSession(kernel);
  let t: Tool = { ...armCam("geneva"), plane: XY, points: [[0, 0, 0]], cursor: [20, 0, 0] };
  for (const k of ["7", "Tab", "2", "1", "Tab", "5", "Tab", "0", ".", "3", "3"]) t = typeKey(t, k); // (7 slots, crank 21, pin 5, clearance 0.33)
  const t0 = performance.now();
  const pv = previewOf(scene(s), t);
  const ms = performance.now() - t0;
  assert.ok(pv && pv.segments.length > 200, "the wheel, the crank and the disc are drawn");
  assert.ok(ms < 250, `${ms.toFixed(0)} ms`);
  const fin = finish(scene(s), t);
  assert.ok(fin, "Enter makes it");
  const made = run(s, fin!.command);
  const rec = scene(made).gears![0]!;
  const real = camShapes(rec.spec.cam!);
  assert.ok(real.ok);
  const ring = real.value.rings![0]!;
  const centre = [ring.reduce((t, q) => t + q[0], 0) / ring.length, ring.reduce((t, q) => t + q[1], 0) / ring.length]; // (no hole here, so no shaft to measure from: the middle of the points will do)
  const rs = ring.map((q) => Math.hypot(q[0] - centre[0]!, q[1] - centre[1]!));
  assert.ok(Math.max(...rs) - Math.min(...rs) > 1, "the real disc is the notched one, not a circle");
});

// ---- the notch's edge is smooth (`in_819`)
test("smoothing the radii never makes one bigger, and takes the scallops out of a notch's edge", () => {
  // a rim of radius 10 with a notch cut to a scalloped edge: radii that dip in a regular wiggle
  const raw = Array.from({ length: 720 }, (_, i) => (i > 200 && i < 320 ? 4 + 0.6 * Math.abs(Math.sin(i / 3)) : 10));
  const smooth = smoothUnder(raw, 8);
  smooth.forEach((v, i) => assert.ok(v <= raw[i]! + 1e-12, `at ${i}: ${v} against ${raw[i]}`));
  const rough = (r: number[]) => r.reduce((t, v, i) => t + Math.abs(r[(i + 1) % r.length]! - 2 * v + r[(i + r.length - 1) % r.length]!), 0);
  assert.ok(rough(smooth) < rough(raw) * 0.4, `${rough(smooth)} against ${rough(raw)}`);
  assert.deepEqual(smoothUnder([5, 5, 5, 5, 5, 5, 5, 5], 2), [5, 5, 5, 5, 5, 5, 5, 5], "a plain rim stays as it is");
});

test("the real locking disc's outline has no ridges: the second difference of its radius along the notch is small", () => {
  const sp = spec({ teeth: 5, crank: 20, pin: 5, diameter: 40, hole: -1, lock: undefined });
  const sh = camShapes(sp);
  assert.ok(sh.ok);
  const { local } = drive(sp);
  const rs = local.map(([x, y]) => Math.hypot(x, y));
  // along the outline (16 points to each span between knots) the radius changes by steps that are themselves steady: no wiggle of more than a fifth of a millimetre between neighbours
  let worst = 0;
  for (let i = 0; i + 2 < rs.length; i++) worst = Math.max(worst, Math.abs(rs[i]! - 2 * rs[i + 1]! + rs[i + 2]!));
  assert.ok(worst < 0.2, `worst second difference ${worst.toFixed(3)} mm`);
});

// ---- the three layouts (`in_820`)
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera, projector } from "../src/interaction/camera.ts";
import { editCamTool } from "../src/interaction/tools.ts";

const base5 = (over: Partial<CamSpec> = {}): CamSpec => spec({ teeth: 5, crank: 20, pin: 5, diameter: 40, hole: -1, lock: undefined, ...over });

test("assembled: the crank and the locking disc are on the crank's shaft, a centre distance from the wheel's, the pin away from the wheel, and the wheel and the disc do not meet", () => {
  const c = genevaCentres(5, 20);
  const sh = camShapes(base5({ layout: "assembled" }));
  assert.ok(sh.ok && sh.value.polys!.length === 2 && sh.value.rings!.length === 1);
  const crank = sh.value.polys![1]!.points;
  assert.ok(Math.abs(Math.max(...crank.map((q) => q[0])) - (c + 20)) < 1e-6, "the crank's end is the pin, a crank radius beyond its shaft");
  assert.ok(crank.every((q) => Math.abs(q[1]) <= 2.6), "the crank lies along the line of centres");
  assert.ok(!sh.value.circles.some((q) => !q.hole), "no pin circle in a sketch of the assembly");
  const { wheel, local } = drive(base5({ layout: "assembled" }));
  const placed = local.map(([x, y]): Pt => [x + c, y]); // (the disc in the pose the wheel is locked in: turned by nothing)
  assert.ok(!overlap(wheel, placed), "locked: the wheel and the disc do not meet");
  // and it is locked: a turn of the wheel either way runs it into the disc (the wheel is drawn in the pose it is locked in, a locking arc facing the disc)
  for (const dt of [-0.05, 0.05]) assert.ok(overlap(turned(wheel, dt), placed), `a turn of ${dt} is blocked`);
  const { s } = make(base5({ layout: "assembled" }));
  assert.equal(Object.values(scene(s).steps).length, 0, "a sketch: no steps");
});

test("the model: three bodies in place: the wheel and the locking disc one layer up from the plane, the crank plate under it with its pin joined and standing up through the layer", () => {
  const { s } = make(base5({ layout: "model", layer: 6, plate: 3 }));
  const steps = scene(s).steps;
  assert.deepEqual(steps.map((st) => `${st.params.mode}:${st.params.depth}`), ["new:6", "new:6", "new:-3", "add:6"]);
  const bodies = Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { bbox: { min: number[]; max: number[] }; volume: number }[];
  assert.equal(bodies.length, 3, "the wheel, the locking disc, and the crank with its pin");
  const byZ = (lo: number, hi: number) => bodies.filter((b) => Math.abs(b.bbox.min[2]! - lo) < 1e-6 && Math.abs(b.bbox.max[2]! - hi) < 1e-6);
  assert.equal(byZ(0, 6).length, 2, "the wheel and the disc: from the plane up the layer");
  assert.equal(byZ(-3, 6).length, 1, "the crank: its plate below the plane, its pin up to the top of the layer");
  const c = genevaCentres(5, 20);
  const crank = byZ(-3, 6)[0]!;
  assert.ok(crank.bbox.max[0]! > c + 20 - 0.01 && crank.bbox.min[0]! > c - 12, "the crank is on its shaft");
  // a thicker layer changes the bodies by the same steps
  const next = run(s, { type: "setGear", id: "g_001", spec: { teeth: 1, module: 1, cam: { ...(scene(s).gears![0]!.spec.cam as CamSpec), layer: 8 } } });
  assert.ok(!next.message, next.message ?? "");
  assert.equal(scene(next).steps.length, 4);
  const taller = (Object.values(scene(next).parts).filter((p) => p.kind === "body") as unknown as { bbox: { max: number[] } }[]).filter((b) => Math.abs(b.bbox.max[2]! - 8) < 1e-6);
  assert.equal(taller.length, 3, "all three are as tall as the new layer");
  const gone = run(next, { type: "deleteGear", id: "g_001" });
  assert.equal(Object.values(scene(gone).parts).filter((p) => p.kind === "body").length, 0, "the bodies go with the record");
});

test("the layouts are in the Geneva submenu; the model's box has Layer and Plate; Edit reads them back; the apart sketch is as before", () => {
  const env = { w: 800, h: 600, now: 0 };
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "tool:geneva:model" }, env as never);
  assert.equal(st.tool!.cam!.layout, "model");
  assert.equal(st.tool!.cam!.typed.length, 8);
  let t: Tool = { ...st.tool!, plane: XY, points: [[0, 0, 0]], cursor: [20, 0, 0] };
  for (const k of ["5", "Tab", "2", "0", "Tab", "5", "Tab", "0", ".", "3", "Tab", "Tab", "Tab", "8", "Tab", "4"]) t = typeKey(t, k);
  const sp = camSpecOf(t)!;
  assert.deepEqual([sp.teeth, sp.crank, sp.pin, sp.layout, sp.layer, sp.plate], [5, 20, 5, "model", 8, 4]);
  const fin = finish(scene(createSession(kernel)), t);
  assert.ok(fin);
  const made = run(createSession(kernel), fin!.command);
  assert.equal(scene(made).steps.length, 4);
  const et = editCamTool(scene(made).gears![0]!);
  assert.equal(et.cam!.layout, "model");
  assert.deepEqual(et.cam!.typed.slice(6), ["8", "4"]);
  const apart = camSpecOf({ ...armCam("geneva"), plane: XY, points: [[0, 0, 0]], cursor: [10, 0, 0] })!;
  assert.equal(apart.layout, undefined, "the apart sketch is the default and keeps no layout");
});

// ---- every slot count makes a drive (`in_986`)
test("with the pin left to the box, every slot count has a drive: a locking disc with room, holes in the wheel and the crank, and nothing overlapping the wheel", () => {
  for (const n of [3, 4, 5, 6, 8, 10, 12, 16, 24]) {
    const a = 60; // (a crank big enough for every count: the rim is kept 0.8 mm off the crank's shaft)
    const pin = genevaDefaultPin(n, a);
    const sh = camShapes({ kind: "geneva", teeth: n, diameter: 2 * a, crank: a, pin, clearance: 0.3, hole: -1, lift: 0, layout: "model" });
    assert.ok(sh.ok, `${n} slots: ${sh.ok ? "" : (sh as { error: string }).error}`);
    const wheel = outlinePoints(sh.value.polys![0]!.points, sh.value.polys![0]!.bulges) as Pt[];
    const disc = sh.value.rings![0]!;
    assert.ok(area(disc) > 0.01 * Math.PI * a * a / 25, `${n} slots: the locking disc is not cut away to nothing`);
    assert.ok(!disc.some((q) => inside(wheel, [q[0]!, q[1]!])), `${n} slots: the disc is clear of the wheel`);
    const holes = sh.value.circles.filter((c) => c.hole);
    assert.ok(holes.length >= 2 && holes.slice(0, 2).every((c) => c.r > 0), `${n} slots: the wheel and the crank have the shaft's hole`);
  }
  assert.equal(genevaDefaultPin(4, 10), 2.5, "four slots: a quarter, as before");
  assert.ok(genevaDefaultPin(12, 60) < 60 / 4, "many slots: a smaller pin, so the rim stays off the crank's shaft");
});

test("a wheel whose rim would reach the crank's shaft says so instead of drawing a locking disc cut to nothing", () => {
  const sh = camShapes({ kind: "geneva", teeth: 24, diameter: 8, crank: 4, pin: 1, clearance: 0.3, hole: -1, lift: 0, layout: "model" });
  assert.ok(!sh.ok);
  assert.match((sh as { error: string }).error, /rim would reach the crank's shaft/);
  const noLock = camShapes({ kind: "geneva", teeth: 24, diameter: 8, crank: 4, pin: 1, clearance: 0.1, hole: -1, lock: 0, lift: 0, layout: "model" });
  assert.ok(noLock.ok || !/rim would reach/.test((noLock as { error: string }).error), "with no locking disc the rim does not matter");
});

test("a cam tool is sized by a click as a gear is: the first click after the centre sets the scale, the box stays, the next click makes it and the tool is over", () => {
  const env = { w: 800, h: 600, now: 0 };
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "tool:geneva" }, env as never);
  st = { ...st, tool: { ...st.tool!, plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0] } };
  const pr = projector(st.cam, env.w, env.h);
  const [x0, y0] = pr.project([30, 0, 0]);
  st = reduce(st, { type: "hover", x: x0, y: y0 }, env as never);
  st = reduce(st, { type: "click", x: x0, y: y0, count: 1, shift: false } as never, env as never);
  assert.ok(st.tool?.sized, "the click set the scale");
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "face").length, 0, "nothing is made yet");
  const sized = camSpecOf(st.tool!)!;
  st = { ...st, tool: typeKey(st.tool!, "6") }; // (the box stays open to change the numbers)
  const [x1, y1] = pr.project([5, 0, 0]);
  st = reduce(st, { type: "hover", x: x1, y: y1 }, env as never);
  assert.equal(camSpecOf(st.tool!)!.crank, sized.crank, "the pointer no longer changes the scale");
  assert.equal(camSpecOf(st.tool!)!.teeth, 6);
  st = reduce(st, { type: "click", x: x1, y: y1, count: 1, shift: false } as never, env as never);
  assert.equal(st.tool, null, "made, and the tool is over");
  assert.ok(scene(st.session).gears?.[0]?.spec.cam?.teeth === 6);
});

test("Edit cam: Done when nothing was changed, Update when a number was; either lets go of the tool", async () => {
  const { entryOf } = await import("../src/interaction/entry.ts");
  const { editCamTool } = await import("../src/interaction/tools.ts");
  const made = run(createSession(kernel), { type: "gear", id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 1, module: 1, cam: spec({ teeth: 5, crank: 30, diameter: 60, pin: 4, hole: -1, lock: undefined }) } });
  assert.ok(!made.message, made.message ?? "");
  let t = editCamTool(scene(made).gears![0]!);
  assert.deepEqual(entryOf(scene(made), t, null)!.gearButtons, { edit: true, changed: false });
  t = typeKey(t, "7");
  assert.equal(entryOf(scene(made), t, null)!.gearButtons!.changed, true);
});
