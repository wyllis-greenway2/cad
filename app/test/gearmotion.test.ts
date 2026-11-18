// Gears that turn each other (`dec_mechanism_motion`, stage 2): the gears meshed with the one played turn by the ratio of the teeth, a rack slides, the matrices are the app's own, and keeping the pose sets the records.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { gearOutline } from "../src/operation/gear.ts";
import { loopFaceRef, diskFaceRef } from "../src/operation/loops.ts";
import { meshWith } from "../src/operation/mesh.ts";
import { followersOf, bodyOfGear } from "../src/operation/gearcouple.ts";
import { startMotion, jointMatrix, keepCommand } from "../src/interaction/motion.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { meshGearTool, finish } from "../src/interaction/tools.ts";

await kernel.init();
const XY = worldRef("XY");
const [U, V]: [[number, number, number], [number, number, number]] = [[1, 0, 0], [0, 1, 0]];
type P3 = readonly [number, number, number];
const rec = (id: string, at: P3, spec: GearSpec, turn = 0): GearRecord => ({ id, plane: XY, at: [at[0], at[1], at[2]], spec, ...(turn ? { turn } : {}) });
const near = (a: readonly number[], b: readonly number[], tol = 1e-6) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]!) < tol, `${i}: ${v} against ${b[i]}`));
const apply = (m: number[], p: [number, number, number]): number[] => [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!];

/** gears made in the scene as records, each with its body (extruded `depth`), the later ones meshed with the one named */
function build(items: { id: string; at: P3; spec: GearSpec; turn?: number; with?: string; body?: boolean }[]): Session {
  let s = createSession(kernel);
  for (const it of items) {
    const r = rec(it.id, it.at, it.spec, it.turn ?? 0);
    s = run(s, { type: "gear", id: r.id, plane: XY, at: r.at, spec: r.spec, ...(r.turn ? { turn: r.turn } : {}), ...(it.with ? { meshWith: it.with } : {}) });
    assert.ok(!s.message, `${it.id}: ${s.message}`);
    if (it.body === false) continue;
    const refs = gearRefs(r);
    const face = refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines); // (a ring: the disk of its wall, the teeth are the hole)
    const op = startOp(scene(s), [face as never], "extrude");
    assert.ok(op.ok, JSON.stringify(op));
    s = runOp(s, { ...(op as { op: Op }).op, value: 5 })!.session;
    assert.ok(!s.message, `${it.id}: ${s.message}`);
  }
  return s;
}
/** the partner of `a` with this many teeth, as the Mesh gear tool places it */
const partnerOf = (a: GearRecord, teeth: number, extra: { rack?: boolean; ring?: boolean } = {}, where = 0) => { const r = meshWith(a, U, V, { teeth, ...extra }, where); assert.ok(r.ok, r.ok ? "" : r.error); return { ...r.value, at: [r.value.at[0], r.value.at[1], r.value.at[2]] as [number, number, number] }; };
const G1: GearSpec = { teeth: 20, module: 2, backlash: 0.15 }; // (a little play: gears whose teeth touch exactly are made one body by the kernel)

test("a gear meshed with another turns it the opposite way by the ratio of the teeth: the follower's matrix is that turn about its own axis", () => {
  const a = rec("g_001", [0, 0, 0], G1);
  const p = partnerOf(a, 30);
  const s = build([{ id: "g_001", at: a.at, spec: a.spec }, { id: "g_002", at: p.at, spec: p.spec, turn: p.turn, with: "g_001" }]);
  const bodyA = bodyOfGear(scene(s), scene(s).gears![0]!)!;
  assert.ok(bodyA, "the gear's body is found from the step that made it");
  const st = startMotion(scene(s), bodyA);
  assert.ok(st.ok, st.ok ? "" : st.why);
  assert.equal(st.motion.gear, "g_001");
  assert.equal(st.motion.follows.length, 1);
  const f = st.motion.follows[0]!;
  assert.equal(f.gear, "g_002");
  assert.ok(Math.abs(f.k - -20 / 30) < 1e-12, `${f.k}`);
  // 90 degrees of the driver: the follower turns -60 about its own axis (its centre stays, a point 10 mm off turns with it)
  const m = jointMatrix(f, f.k * 90);
  near(apply(m, [...p.at] as [number, number, number]), p.at);
  const off: [number, number, number] = [p.at[0] + 10, p.at[1], p.at[2]];
  const turned = apply(m, off);
  const a60 = (-60 * Math.PI) / 180;
  near(turned, [p.at[0] + 10 * Math.cos(a60), p.at[1] + 10 * Math.sin(a60), p.at[2]]);
});

test("a chain: each gear goes the other way from the one before it, the ratios multiply; a gear in a ring goes the same way", () => {
  const a = rec("g_001", [0, 0, 0], G1);
  const b = partnerOf(a, 30);
  const c = partnerOf(rec("g_002", b.at, b.spec, b.turn), 15, {}, Math.PI / 2);
  const s = build([{ id: "g_001", at: a.at, spec: a.spec }, { id: "g_002", at: b.at, spec: b.spec, turn: b.turn, with: "g_001" }, { id: "g_003", at: c.at, spec: c.spec, turn: c.turn, with: "g_002" }]);
  const g = scene(s).gears!;
  const { followers } = followersOf(scene(s), g[0]!);
  const k = Object.fromEntries(followers.map((f) => [f.gear, f.k]));
  assert.ok(Math.abs(k.g_002! - -20 / 30) < 1e-12 && Math.abs(k.g_003! - (20 / 30) * (30 / 15)) < 1e-12, JSON.stringify(k));
  // driving the middle one: the others follow it, both ways round
  const mid = followersOf(scene(s), g[1]!).followers;
  const km = Object.fromEntries(mid.map((f) => [f.gear, f.k]));
  assert.ok(Math.abs(km.g_001! - -30 / 20) < 1e-12 && Math.abs(km.g_003! - -30 / 15) < 1e-12, JSON.stringify(km));
  // a gear in a ring
  const small = rec("g_001", [0, 0, 0], { teeth: 10, module: 2, backlash: 0.15 });
  const ring = partnerOf(small, 30, { ring: true });
  const r = build([{ id: "g_001", at: small.at, spec: small.spec }, { id: "g_002", at: ring.at, spec: ring.spec, turn: ring.turn, with: "g_001" }]);
  const kr = followersOf(scene(r), scene(r).gears![0]!).followers[0]!.k;
  assert.ok(Math.abs(kr - 10 / 30) < 1e-12, `the same way round: ${kr}`);
});

test("a pinion turning slides its rack by the pitch radius for each radian, and a rack slid turns the pinion", () => {
  const pin = rec("g_001", [0, 0, 0], { teeth: 12, module: 2, backlash: 0.15 });
  const rack = partnerOf(pin, 10, { rack: true });
  const s = build([{ id: "g_001", at: pin.at, spec: pin.spec }, { id: "g_002", at: rack.at, spec: rack.spec, turn: rack.turn, with: "g_001" }]);
  const [gp, gr] = scene(s).gears!;
  const r = gearOutline(gp!.spec);
  assert.ok(r.ok);
  const f = followersOf(scene(s), gp!).followers[0]!;
  assert.equal(f.kind, "slide");
  assert.ok(Math.abs(Math.abs(f.k) - (r.value.pitchRadius * Math.PI) / 180) < 1e-9, `mm for a degree: ${f.k}`);
  // 90 degrees of the pinion: the rack goes pi/2 pitch radii, along its own line
  near(apply(jointMatrix(f, f.k * 90), [...gr!.at] as [number, number, number]).map((v, i) => v - gr!.at[i]!), f.dir.map((d) => d * f.k * 90));
  assert.ok(Math.abs(Math.abs(f.k * 90) - (r.value.pitchRadius * Math.PI) / 2) < 1e-9);
  // the rack as the driver: the pinion turns the other way round by the same ratio
  const back = followersOf(scene(s), gr!).followers[0]!;
  assert.equal(back.kind, "turn");
  assert.ok(Math.abs(back.k * f.k - 1) < 1e-9, "the two ratios are each other's inverse");
});

test("played through the app: the gear's frame has the follower's own matrix, nothing is written, and keeping the pose sets every gear's turn", () => {
  const a = rec("g_001", [0, 0, 0], G1);
  const b = partnerOf(a, 30);
  const s = build([{ id: "g_001", at: a.at, spec: a.spec }, { id: "g_002", at: b.at, spec: b.spec, turn: b.turn, with: "g_001" }]);
  const env = { w: 800, h: 600, now: 0 };
  const bodyA = bodyOfGear(scene(s), scene(s).gears![0]!)!;
  let st = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [bodyA] } } };
  st = reduce(st, { type: "runAction", id: "motion:play" }, env as never);
  assert.ok(st.motion?.gear === "g_001", "Play on a gear's body");
  st = reduce(st, { type: "motionAt", amount: 36 }, env as never);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.bodyMatrix && f.followers.length === 1, "the gear and the one it turns, each by a matrix");
  near(f.bodyMatrix!, jointMatrix(st.motion!, 36));
  near(f.followers[0]!.matrix, jointMatrix(st.motion!.follows[0]!, (-20 / 30) * 36));
  assert.equal(st.session.history, s.history, "nothing was written");
  const turns0 = scene(s).gears!.map((g) => g.turn ?? 0);
  const kept = reduce(st, { type: "motionKeep" }, env as never);
  assert.equal(kept.motion, null);
  assert.ok(!kept.session.message, kept.session.message ?? "");
  const turns1 = scene(kept.session).gears!.map((g) => g.turn ?? 0);
  assert.ok(Math.abs(turns1[0]! - turns0[0]! - (36 * Math.PI) / 180) < 1e-9, "the driver turned 36 degrees");
  assert.ok(Math.abs(turns1[1]! - turns0[1]! - (-24 * Math.PI) / 180) < 1e-9, "the other 24 the other way");
  assert.equal(Object.values(scene(kept.session).parts).filter((p) => p.kind === "body" && p.ref !== "b/body/o").length, 2, "both bodies are still there, made again by the records");
  assert.equal(keepCommand(scene(s), { ...st.motion!, amount: 0 }), null);
});

test("a gear with no body, or one meshed with a worm, a pulley or a cam, is not drawn moved; the Mesh gear tool records what a gear was meshed with", () => {
  const a = rec("g_001", [0, 0, 0], G1);
  const s = build([{ id: "g_001", at: a.at, spec: a.spec, body: false }]);
  const r = startMotion(scene(s), "b/body/o" as Ref);
  assert.equal(r.ok, false);
  // the tool
  const t = { ...meshGearTool(scene(s).gears![0]!, false), cursor: [50, 0, 0] as [number, number, number] };
  const fin = finish(scene(s), t);
  assert.ok(fin && fin.command.type === "gear", "a partner is made");
  assert.equal((fin!.command as { meshWith?: string }).meshWith, "g_001", "and says which gear it was meshed with");
});

test("a planetary set is wired up as meshed: playing the sun turns the planets and the ring by the tooth ratios (the carrier held), and the planets and the ring play back to the sun", async () => {
  const { addPlanetary } = await import("../src/operation/planetary.ts");
  void addPlanetary;
  let s = createSession(kernel);
  s = run(s, { type: "planetary", id: "q_001", plane: XY, at: [0, 0, 0], spec: { sun: 12, planet: 18, planets: 3, module: 1, width: 5, backlash: 0.15 } });
  assert.ok(!s.message, s.message ?? "");
  const sc = scene(s);
  const q = sc.planetaries![0]!;
  const sun = sc.gears!.find((g) => g.id === q.sunId)!;
  const r = followersOf(sc, sun);
  assert.equal(r.followers.length, 4, r.why ?? "the three planets and the ring");
  const kOf = (id: string) => r.followers.find((f) => f.gear === id)!.k;
  for (const p of q.planetIds) assert.ok(Math.abs(kOf(p) + 12 / 18) < 1e-9, "a planet turns the opposite way by 12/18");
  assert.ok(Math.abs(kOf(q.ringId) + 12 / 48) < 1e-9, "the ring (48 teeth) turns the way the planets do, the sun's turn times 12/48 backwards");
  // from a planet: the sun and the other planets and the ring all follow
  const planet = sc.gears!.find((g) => g.id === q.planetIds[1])!;
  assert.equal(followersOf(sc, planet).followers.length, 4);
});

test("a planetary carrier played: the planets go round the centre with it and turn 1 + S/P in the world, the ring 1 + S/R, the sun stays; the pose is not kept", async () => {
  const { carrierPlay } = await import("../src/operation/gearcouple.ts");
  const { followMatrix } = await import("../src/interaction/motion.ts");
  let s = createSession(kernel);
  s = run(s, { type: "planetary", id: "q_001", plane: XY, at: [0, 0, 0], spec: { sun: 12, planet: 18, planets: 3, module: 1, width: 5, backlash: 0.15, carrier: 3 } });
  assert.ok(!s.message, s.message ?? "");
  const sc = scene(s);
  const q = sc.planetaries![0]!;
  const carrier = Object.values(sc.parts).find((p) => p.kind === "body" && (p as { id?: string }).id === `x_${q.carrierStep}`)!;
  assert.ok(carrier, "the carrier has a body");
  const r = startMotion(sc, carrier.ref);
  assert.ok(r.ok, r.ok ? "" : r.why);
  if (!r.ok) return;
  assert.equal(r.motion.follows.length, 4, "three planets and the ring; the sun is held");
  const planet = r.motion.follows.find((f) => f.gear === q.planetIds[0])!;
  const g = sc.gears!.find((x) => x.id === q.planetIds[0])!;
  const m = followMatrix(planet, 90);
  const a = g.at as unknown as [number, number, number], b: [number, number, number] = [a[0] + 5, a[1], a[2]];
  const [pa, pb] = [apply(m, a), apply(m, b)];
  const orbit = [a[0] * Math.cos(Math.PI / 2) - a[1] * Math.sin(Math.PI / 2), a[0] * Math.sin(Math.PI / 2) + a[1] * Math.cos(Math.PI / 2)];
  near([pa[0]!, pa[1]!], orbit, 1e-6); // (the planet's centre has gone a quarter of the way round)
  const ang = Math.atan2(pb[1]! - pa[1]!, pb[0]! - pa[0]!) * 180 / Math.PI;
  assert.ok(Math.abs(ang - 90 * (1 + 12 / 18)) < 1e-6, `turned ${ang}`);
  const ring = r.motion.follows.find((f) => f.gear === q.ringId)!;
  assert.ok(Math.abs(ring.k - (1 + 12 / 48)) < 1e-9);
  assert.equal(keepCommand(sc, { ...r.motion, amount: 90 }), null);
});

test("while a motion plays the bar's number stays within half a turn either way, and nothing under the pointer is lit (it would be at the rest pose, not where the picture is)", () => {
  const a = rec("g_001", [0, 0, 0], G1);
  const s = build([{ id: "g_001", at: a.at, spec: a.spec }]);
  const env = { w: 800, h: 600, now: 0 };
  const body = bodyOfGear(scene(s), scene(s).gears![0]!)!;
  let st = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body] }, hover: body }, hoverPoint: [1, 2, 3] };
  st = reduce(st, { type: "runAction", id: "motion:play" }, env as never);
  st = { ...st, motion: { ...st.motion!, amount: 1234.5 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(Math.abs(f.motionBar!.amount - (1234.5 - 1080)) < 1e-9, `${f.motionBar!.amount}`);
  assert.ok(f.motionBar!.amount >= -180 && f.motionBar!.amount < 180);
  assert.equal(f.highlight.hover, undefined);
  assert.equal(f.highlight.hoverPoint, null);
});

test("the number in the bar is always the same width, so the words round it do not move as it changes (`in_961`)", () => {
  const a = rec("g_001", [0, 0, 0], G1);
  const s = build([{ id: "g_001", at: a.at, spec: a.spec }]);
  const env = { w: 800, h: 600, now: 0 };
  const body = bodyOfGear(scene(s), scene(s).gears![0]!)!;
  let st = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [body] } } };
  st = reduce(st, { type: "runAction", id: "motion:play" }, env as never);
  const labels = [-100.5, -93.7, -78, -72, -9.7, 0, 5, 45, 99.96, 179.9].map((amount) => frameOf({ ...st, motion: { ...st.motion!, amount } }, { w: 800, h: 600 }).motionBar!.label);
  assert.equal(new Set(labels.map((l) => l.length)).size, 1, `all one width: ${JSON.stringify(labels)}`);
  assert.ok(labels.every((l) => /^turned [ -]*[0-9]+\.[0-9]°$/.test(l.replace(/ /g, " "))), JSON.stringify(labels));
  assert.ok(labels[0]!.endsWith("-100.5°") && labels[2]!.endsWith(" -78.0°"), "one decimal always");
});
