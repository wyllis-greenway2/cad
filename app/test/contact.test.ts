// Contact push (`dec_contact_push`, `in_904`): a Geneva drive with a hard body in it is played without its formula; the wheel yields to the pin and the locking disc by the smallest angle that clears it.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { CamSpec } from "../src/operation/cams.ts";
import { genevaBodies, genevaTurn, followAmount } from "../src/operation/gearcouple.ts";
import { startMotion } from "../src/interaction/motion.ts";
import { solveContact } from "../src/interaction/contact.ts";

await kernel.init();
const XY = worldRef("XY");
const N = 5, A = 20;
const sp: CamSpec = { kind: "geneva", teeth: N, diameter: 40, crank: A, pin: 5, clearance: 0.3, hole: -1, lift: 0, layout: "model", layer: 6, plate: 3 };
const make = (hard: boolean) => {
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 1, module: 1, cam: sp } });
  assert.ok(!s.message, s.message ?? "");
  const b = genevaBodies(scene(s), scene(s).gears![0]!);
  if (hard) { const id = (scene(s).parts[b.crank!] as { id: string }).id; s = run(s, { type: "setHard", body: id, on: true }); assert.ok(!s.message, s.message ?? ""); }
  return { s, b };
};

test("without a hard body the Geneva is played by its formula, as before", () => {
  const { s, b } = make(false);
  const r = startMotion(scene(s), b.crank!);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(!r.motion.contact && r.motion.follows.some((f) => f.geneva));
});

test("with the crank hard the wheel is not given its formula: it yields to the pin and the locking disc, step after step, and follows the formula within the clearance", () => {
  const { s, b } = make(true);
  const r = startMotion(scene(s), b.crank!);
  assert.ok(r.ok, r.ok ? "" : r.why);
  if (!r.ok) return;
  let m = r.motion;
  assert.ok(m.contact && m.contact.pushables.some((p) => p.body === b.wheel), "the wheel can yield");
  assert.ok(!m.follows.some((f) => f.geneva), "its formula is not used");
  let worst = 0;
  for (let deg = 1; deg <= 720; deg++) {
    m = solveContact(scene(s), { ...m, amount: deg });
    assert.ok(!m.contact!.jam, `jammed at ${deg}: ${m.contact!.jam}`);
    const wheel = m.yields!.find((f) => f.body === b.wheel)!;
    worst = Math.max(worst, Math.abs(followAmount(wheel, deg) - genevaTurn(N, A, deg)));
  }
  assert.ok(worst < 3, `the wheel is within ${worst} degrees of the formula`);
  const end = followAmount(m.yields!.find((f) => f.body === b.wheel)!, 720);
  assert.ok(Math.abs(end + 144) < 2, `two turns of the crank are two slots: ${end}`);
});

test("a scrub jumps many degrees at once and the wheel is still where it should be (it is worked out in steps)", () => {
  const { s, b } = make(true);
  const r = startMotion(scene(s), b.crank!);
  assert.ok(r.ok);
  if (!r.ok) return;
  const m = solveContact(scene(s), { ...r.motion, amount: 300 }, undefined, Infinity);
  assert.ok(!m.contact!.jam);
  assert.ok(Math.abs(followAmount(m.yields!.find((f) => f.body === b.wheel)!, 300) - genevaTurn(N, A, 300)) < 3);
});

test("a moving body that meets a hard wall it cannot push stops there, and says what it was against", async () => {
  const { drawCircle } = await import("../src/operation/build.ts");
  const { nextId } = await import("../src/operation/scene.ts");
  const { s: s0, b } = make(true);
  const c = drawCircle(scene(s0), XY, [34, 20, 0], 3);
  let s = run(s0, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 6, mode: "new" } } });
  const post = Object.values(scene(s).parts).find((p) => p.kind === "body" && ![b.wheel, b.disc, b.crank].includes(p.ref) && p.ref !== "b/body/o")!;
  s = run(s, { type: "setHard", body: (post as { id: string }).id, on: true });
  s = run(s, { type: "setFixed", body: (post as { id: string }).id, on: true }); // (a hard body with no joint is pushed aside, `in_1029`: a wall is marked fixed)
  const r = startMotion(scene(s), b.crank!);
  assert.ok(r.ok);
  if (!r.ok) return;
  const m = solveContact(scene(s), { ...r.motion, playing: true, amount: 150 }, undefined, Infinity); // (no budget: this is about the wall, not the time; under load a call of 150 steps could be cut short)
  assert.ok(m.contact!.jam && /against/.test(m.contact!.jam), `jam: ${m.contact!.jam}`);
  assert.ok(m.amount > 40 && m.amount < 100, `stopped at ${m.amount} degrees, before the post`);
  assert.equal(m.playing, false);
  const free = solveContact(scene(s), { ...m, amount: 20 });
  assert.ok(!free.contact!.jam, "backing away is free");
});

test("a gear pair: with the driver hard the driven gear yields to its teeth, and follows the ratio of the teeth within a degree, with no formula", async () => {
  const { startOp } = await import("../src/interaction/operations.ts");
  const { runOp } = await import("../src/interaction/runop.ts");
  const { gearRefs } = await import("../src/operation/gearscene.ts");
  const { loopFaceRef, diskFaceRef } = await import("../src/operation/loops.ts");
  const { meshWith } = await import("../src/operation/mesh.ts");
  const { bodyOfGear, gearAxis } = await import("../src/operation/gearcouple.ts");
  const { startContact } = await import("../src/interaction/contact.ts");
  const g1: { id: string; plane: typeof XY; at: [number, number, number]; spec: import("../src/operation/gear.ts").GearSpec; turn?: number } = { id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 20, module: 2, backlash: 0.15 } };
  const p = meshWith(g1, [1, 0, 0], [0, 1, 0], { teeth: 30 }, 0);
  assert.ok(p.ok);
  if (!p.ok) return;
  let s = createSession(kernel);
  for (const [r, withId] of [[g1, undefined], [{ id: "g_002", plane: XY, at: p.value.at, spec: p.value.spec, turn: p.value.turn }, "g_001"]] as const) {
    s = run(s, { type: "gear", id: r.id, plane: XY, at: [...r.at] as [number, number, number], spec: r.spec, ...(r.turn ? { turn: r.turn } : {}), ...(withId ? { meshWith: withId } : {}) });
    const refs = gearRefs(r as never);
    const op = startOp(scene(s), [(refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)) as never], "extrude");
    assert.ok(op.ok);
    s = runOp(s, { ...(op as { op: import("../src/interaction/operations.ts").Op }).op, value: 5 })!.session;
  }
  const [a, b] = scene(s).gears!;
  const [bodyA, bodyB] = [bodyOfGear(scene(s), a!)!, bodyOfGear(scene(s), b!)!];
  s = run(s, { type: "setHard", body: (scene(s).parts[bodyA] as { id: string }).id, on: true });
  const r = startMotion(scene(s), bodyA, "turn", s.outcome);
  assert.ok(r.ok);
  if (!r.ok) return;
  const ax = gearAxis(scene(s), scene(s).gears![1]!)!;
  const stripped: typeof r.motion = { ...r.motion, follows: [] as typeof r.motion.follows };
  const contact = startContact(scene(s), stripped, [{ body: bodyB, point: ax.point, dir: ax.dir }], s.outcome);
  assert.ok(contact);
  let m: typeof r.motion = { ...stripped, contact: contact! };
  let worst = 0;
  for (let deg = 1; deg <= 90; deg++) {
    m = solveContact(scene(s), { ...m, amount: deg }, s.outcome);
    assert.ok(!m.contact!.jam, `jam at ${deg}: ${m.contact!.jam}`);
    worst = Math.max(worst, Math.abs(followAmount(m.yields![0]!, deg) - (-20 / 30) * deg));
  }
  assert.ok(worst < 1.5, `within ${worst} degrees of the ratio`);
});

test("a train of three gears, all by contact: the chain gives way link by link, within a degree and a half of the ratios, no jam", async () => {
  const { startOp } = await import("../src/interaction/operations.ts");
  const { runOp } = await import("../src/interaction/runop.ts");
  const { gearRefs } = await import("../src/operation/gearscene.ts");
  const { loopFaceRef, diskFaceRef } = await import("../src/operation/loops.ts");
  const { meshWith } = await import("../src/operation/mesh.ts");
  const { bodyOfGear, gearAxis } = await import("../src/operation/gearcouple.ts");
  const { startContact } = await import("../src/interaction/contact.ts");
  const teeth = [20, 30, 24];
  type Rec = { id: string; plane: typeof XY; at: [number, number, number]; spec: import("../src/operation/gear.ts").GearSpec; turn?: number };
  let prev: Rec = { id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 20, module: 2, backlash: 0.15 } };
  const recs: Rec[] = [prev];
  for (let i = 1; i < 3; i++) {
    const p = meshWith(prev as never, [1, 0, 0], [0, 1, 0], { teeth: teeth[i]! }, 0);
    assert.ok(p.ok);
    if (!p.ok) return;
    prev = { id: `g_00${i + 1}`, plane: XY, at: [...p.value.at] as [number, number, number], spec: p.value.spec, turn: p.value.turn };
    recs.push(prev);
  }
  let s = createSession(kernel);
  for (const r of recs) {
    s = run(s, { type: "gear", id: r.id, plane: XY, at: r.at, spec: r.spec, ...(r.turn ? { turn: r.turn } : {}) });
    const refs = gearRefs(r as never);
    const op = startOp(scene(s), [(refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)) as never], "extrude");
    assert.ok(op.ok);
    s = runOp(s, { ...(op as { op: import("../src/interaction/operations.ts").Op }).op, value: 5 })!.session;
  }
  const bodies = scene(s).gears!.map((g) => bodyOfGear(scene(s), g)!);
  assert.equal(new Set(bodies).size, 3, "three bodies");
  s = run(s, { type: "setHard", body: (scene(s).parts[bodies[0]!] as { id: string }).id, on: true });
  const r = startMotion(scene(s), bodies[0]!, "turn", s.outcome);
  assert.ok(r.ok);
  if (!r.ok) return;
  const stripped: typeof r.motion = { ...r.motion, follows: [] as typeof r.motion.follows };
  const contact = startContact(scene(s), stripped, scene(s).gears!.slice(1).map((g, i) => { const ax = gearAxis(scene(s), g)!; return { body: bodies[i + 1]!, point: ax.point, dir: ax.dir }; }), s.outcome);
  assert.ok(contact);
  let m: typeof r.motion = { ...stripped, contact: contact! };
  const ratio = [1, -20 / 30, (20 / 30) * (30 / 24)];
  let worst = 0;
  for (let deg = 1; deg <= 60; deg++) {
    m = solveContact(scene(s), { ...m, amount: deg }, s.outcome);
    assert.ok(!m.contact!.jam, `jam at ${deg}: ${m.contact!.jam}`);
    m.yields!.forEach((y, i) => { worst = Math.max(worst, Math.abs(followAmount(y, deg) - ratio[i + 1]! * deg)); });
  }
  assert.ok(worst < 1.5, `within ${worst} degrees of the ratios`);
});

test("hardness is passed on to three links: a train of six gears with the first one hard carries the push to the fifth and says the chain goes on; marking the fourth hard too carries it to the sixth (`in_1019`)", async () => {
  const { startOp } = await import("../src/interaction/operations.ts");
  const { runOp } = await import("../src/interaction/runop.ts");
  const { gearRefs } = await import("../src/operation/gearscene.ts");
  const { loopFaceRef, diskFaceRef } = await import("../src/operation/loops.ts");
  const { meshWith } = await import("../src/operation/mesh.ts");
  const { bodyOfGear, gearAxis } = await import("../src/operation/gearcouple.ts");
  const { startContact } = await import("../src/interaction/contact.ts");
  const teeth = [20, 30, 24, 36, 20, 30];
  type Rec = { id: string; plane: typeof XY; at: [number, number, number]; spec: import("../src/operation/gear.ts").GearSpec; turn?: number };
  let prev: Rec = { id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 20, module: 2, backlash: 0.15 } };
  const recs: Rec[] = [prev];
  for (let i = 1; i < 6; i++) {
    const p = meshWith(prev as never, [1, 0, 0], [0, 1, 0], { teeth: teeth[i]! }, 0);
    assert.ok(p.ok);
    if (!p.ok) return;
    prev = { id: `g_00${i + 1}`, plane: XY, at: [...p.value.at] as [number, number, number], spec: p.value.spec, turn: p.value.turn };
    recs.push(prev);
  }
  let s0 = createSession(kernel);
  for (const r of recs) {
    s0 = run(s0, { type: "gear", id: r.id, plane: XY, at: r.at, spec: r.spec, ...(r.turn ? { turn: r.turn } : {}) });
    const refs = gearRefs(r as never);
    const op = startOp(scene(s0), [(refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)) as never], "extrude");
    assert.ok(op.ok);
    s0 = runOp(s0, { ...(op as { op: import("../src/interaction/operations.ts").Op }).op, value: 5 })!.session;
  }
  const bodies = scene(s0).gears!.map((g) => bodyOfGear(scene(s0), g)!);
  assert.equal(new Set(bodies).size, 6);
  const ratio = [1]; for (let i = 1; i < 6; i++) ratio.push(ratio[i - 1]! * -teeth[i - 1]! / teeth[i]!);
  const play = (hard: number[]) => {
    let s = s0;
    for (const k of hard) s = run(s, { type: "setHard", body: (scene(s).parts[bodies[k]!] as { id: string }).id, on: true });
    const r = startMotion(scene(s), bodies[0]!, "turn", s.outcome);
    assert.ok(r.ok);
    if (!r.ok) return null;
    const stripped: typeof r.motion = { ...r.motion, follows: [] as typeof r.motion.follows };
    const contact = startContact(scene(s), stripped, scene(s).gears!.slice(1).map((g, i) => { const ax = gearAxis(scene(s), g)!; return { body: bodies[i + 1]!, point: ax.point, dir: ax.dir }; }), s.outcome)!;
    let m: typeof r.motion = { ...stripped, contact };
    for (let deg = 1; deg <= 45; deg++) { m = solveContact(scene(s), { ...m, amount: deg }, s.outcome); assert.ok(!m.contact!.jam, `jam at ${deg}: ${m.contact!.jam}`); }
    return m;
  };
  const err = (m: NonNullable<ReturnType<typeof play>>, i: number) => Math.abs(followAmount(m.yields![i - 1]!, 45) - ratio[i]! * 45);
  const one = play([0])!;
  assert.ok([1, 2, 3, 4].every((i) => err(one, i) < 3), "gears two to five are driven");
  assert.ok(err(one, 5) > 20, `the sixth is past the depth and stays (it is ${err(one, 5).toFixed(0)} degrees from its ratio)`);
  assert.match(one.contact!.note ?? "", /past the depth of 3/, "and the bar says so");
  const two = play([0, 3])!;
  assert.ok([1, 2, 3, 4, 5].every((i) => err(two, i) < 3.5), "with the fourth hard too, all six are driven");
  assert.equal(two.contact!.note, null, "and nothing to say");
});

test("a call has a budget of time: a long scrub that cannot be worked out in it is done in parts, the amount stops where it got to and the bar says the push plays slower (`in_1020`)", () => {
  const { s, b } = make(true);
  const r = startMotion(scene(s), b.crank!, "turn", s.outcome);
  assert.ok(r.ok);
  if (!r.ok) return;
  let m = solveContact(scene(s), { ...r.motion, playing: true, amount: 300 }, s.outcome, 0.5); // (half a millisecond: a step or two)
  assert.ok(m.amount > 0 && m.amount < 300, `stopped at ${m.amount} of 300`);
  assert.match(m.contact!.note ?? "", /plays slower/);
  assert.equal(m.playing, true, "it is still playing");
  assert.equal(m.startedAt, null, "and starts again from where it got to");
  assert.equal(m.contact!.target, 300, "a scrub that is cut short remembers where it was asked to go (the next frame goes on)");
  // call after call it gets there, with no jam, and the wheel where the formula has it
  let calls = 1;
  while (Math.abs(m.amount - 300) > 1e-9 && calls < 400) { m = solveContact(scene(s), { ...m, amount: 300 }, s.outcome, 0.5); calls++; assert.ok(!m.contact!.jam, `jam: ${m.contact!.jam}`); }
  assert.ok(calls > 1 && Math.abs(m.amount - 300) < 1e-9, `got there in ${calls} calls`);
  assert.ok(Math.abs(followAmount(m.yields!.find((f) => f.body === b.wheel)!, 300) - genevaTurn(N, A, 300)) < 3);
});
