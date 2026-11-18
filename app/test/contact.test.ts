// Contact push (`dec_contact_push`, `in_896`): a Geneva drive with a hard body in it is played without its formula; the wheel yields to the pin and the locking disc by the smallest angle that clears it.
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
  const m = solveContact(scene(s), { ...r.motion, amount: 300 });
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
  const r = startMotion(scene(s), b.crank!);
  assert.ok(r.ok);
  if (!r.ok) return;
  const m = solveContact(scene(s), { ...r.motion, playing: true, amount: 150 });
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
