// A cam and its follower (`dec_mechanism_motion`, stage 3): the rod that slides in a guide rides the edge of the cam as it turns.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { mateStatus } from "../src/operation/mates.ts";
import { drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";
import { followersOf, followAmount } from "../src/operation/gearcouple.ts";
import { startMotion, keepCommand } from "../src/interaction/motion.ts";
import { camFace } from "../src/operation/camscene.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";

await kernel.init();
const [XY, YZ] = [worldRef("XY"), worldRef("YZ")];
type Body = Extract<Part, { kind: "body" }>;
type PlanePart = Extract<Part, { kind: "plane" }>;
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Body => p.kind === "body" && p.ref !== "b/body/o");
const roundOfBody = (s: Session, body: Body): Ref => (Object.values(scene(s).parts).find((p): p is PlanePart => p.kind === "plane" && p.origin === "body" && p.of === body.ref && !!(p.curved || p.round || p.rounded))!).ref;
/** a rod along x in a guide, in the XY plane's height (z = 0), with a cam record on XY at the origin: an eccentric disc 40 across, offset 5 */
function setup(side: 1 | -1 = 1): { s: Session; rod: Body } {
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 1, module: 1, cam: { kind: "eccentric", diameter: 40, lift: 5, hole: 8 } } });
  const op = startOp(scene(s), [camFace(scene(s).gears![0]!)! as never], "extrude");
  assert.ok(op.ok);
  s = runOp(s, { ...(op as { op: Op }).op, value: 5 })!.session; // (the cam's own body)
  for (const r of [6, 3]) { // (the guide, then the rod, one axis along x)
    const c = drawCircle(scene(s), YZ, [0, 0, 0], r);
    s = run(s, c.command);
    s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 10, mode: "new" } } });
  }
  const [, guide, rod] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, rod!), roundOfBody(s, guide!)]).find((x) => x.id === "mate:coaxial")!.run());
  const m = mateStatus(scene(s)).find((x) => x.state === "ok" && x.mode === "coaxial")!;
  assert.ok(m, "the rod is mated in the guide");
  s = run(s, { type: "setGear", id: "g_001", spec: scene(s).gears![0]!.spec, follower: { mate: m.id, side } });
  assert.ok(!s.message, s.message ?? "");
  return { s, rod: bodies(s).find((x) => x.id === rod!.id)! };
}

test("a cam's follower is worked out from the edge: an eccentric lifts its rod twice the offset, and comes back after a turn", () => {
  const { s, rod } = setup();
  const f = followersOf(scene(s), scene(s).gears![0]!);
  assert.ok(f.followers.length === 1, f.why ?? "no follower");
  const fo = f.followers[0]!;
  assert.equal(fo.kind, "slide");
  assert.equal(fo.body, rod.ref);
  const t = fo.table!;
  assert.equal(t.length, 360);
  assert.ok(Math.abs(Math.max(...t) - Math.min(...t) - 10) < 0.02, `the rise is ${Math.max(...t) - Math.min(...t)}`);
  assert.equal(t[0], 0);
  assert.ok(Math.abs(followAmount(fo, 360)) < 1e-9 && Math.abs(followAmount(fo, 720)) < 1e-9);
  assert.ok(Math.abs(followAmount(fo, -90) - t[270]!) < 1e-9);
  assert.ok(Math.abs(followAmount(fo, 10.5) - (t[10]! + t[11]!) / 2) < 1e-9);
});

test("the other side of the cam is the same lift the other way, and playing the cam carries the follower along", () => {
  const [a, b] = [setup(1), setup(-1)];
  const [ta, tb] = [a, b].map((x) => followersOf(scene(x.s), scene(x.s).gears![0]!).followers[0]!.table!);
  for (const deg of [0, 45, 90, 180]) assert.ok(Math.abs(ta![deg]! + tb![(deg + 180) % 360]! - (ta![0]! + tb![180]!)) < 0.05, `${deg}`);
  const cam = bodies(a.s)[0]!;
  const st = startMotion(scene(a.s), cam.ref);
  assert.ok(st.ok, st.ok ? "" : st.why);
  const mo = { ...st.motion, amount: 90 };
  assert.equal(mo.follows.length, 1);
  const kept = keepCommand(scene(a.s), mo);
  assert.ok(kept && kept.type === "batch", "keeping the pose writes the cam's turn and the rod's slide");
  const after = run(a.s, kept!);
  assert.ok(!after.message, after.message ?? "");
  assert.ok(Math.abs((scene(after).gears![0]!.turn ?? 0) - Math.PI / 2) < 1e-9);
});

test("a rod that does not lie in the cam's plane is not followed, and says why", () => {
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: 1, module: 1, cam: { kind: "eccentric", diameter: 40, lift: 5, hole: 8 } } });
  for (const r of [6, 3]) { const c = drawCircle(scene(s), XY, [0, 0, 0], r); s = run(s, c.command); s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 10, mode: "new" } } }); }
  const [guide, rod] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, rod!), roundOfBody(s, guide!)]).find((x) => x.id === "mate:coaxial")!.run());
  const m = mateStatus(scene(s)).find((x) => x.state === "ok" && x.mode === "coaxial")!;
  s = run(s, { type: "setGear", id: "g_001", spec: scene(s).gears![0]!.spec, follower: { mate: m.id, side: 1 } });
  const f = followersOf(scene(s), scene(s).gears![0]!);
  assert.equal(f.followers.length, 0);
  assert.match(f.why ?? "", /plane/);
  void keepCommand; void startMotion;
});

test("with the cam hard the rod rides its edge by contact: pushed along as the lobe comes round, and following it back as it goes", async () => {
  const { camShapes } = await import("../src/operation/cams.ts");
  const { solveContact } = await import("../src/interaction/contact.ts");
  const { followAmount } = await import("../src/operation/gearcouple.ts");
  const cam = { kind: "eccentric" as const, diameter: 40, lift: 5, hole: 8 };
  const sh = camShapes(cam);
  assert.ok(sh.ok);
  if (!sh.ok) return;
  const disc = sh.value.circles.find((c) => !c.hole)!;
  const at = 10 - disc.c[0] + disc.r; // (the cam to the right of the rod, its left edge touching the rod's end, x = 10)
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: XY, at: [at, 0, 0], spec: { teeth: 1, module: 1, cam } });
  const op = startOp(scene(s), [camFace(scene(s).gears![0]!)! as never], "extrude");
  assert.ok(op.ok);
  s = runOp(s, { ...(op as { op: Op }).op, value: 5 })!.session;
  for (const [r, depth] of [[6, -10], [3, 10]] as const) { const c = drawCircle(scene(s), YZ, [0, 0, 0], r); s = run(s, c.command); s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth, mode: "new" } } }); }
  const [camBody, guide, rod] = bodies(s);
  s = run(s, actionsFor(scene(s), [roundOfBody(s, rod!), roundOfBody(s, guide!)]).find((x) => x.id === "mate:coaxial")!.run());
  const mate = mateStatus(scene(s)).find((x) => x.state === "ok" && x.mode === "coaxial")!;
  s = run(s, { type: "setGear", id: "g_001", spec: scene(s).gears![0]!.spec, follower: { mate: mate.id, side: -1 } });
  s = run(s, { type: "setHard", body: (camBody as { id: string }).id, on: true });
  assert.ok(!s.message, s.message ?? "");
  const r = startMotion(scene(s), camBody!.ref, "turn", s.outcome);
  assert.ok(r.ok, r.ok ? "" : r.why);
  if (!r.ok) return;
  let m = r.motion;
  assert.ok(m.contact?.pushables[0]?.kind === "slide", "the rod can yield by sliding");
  assert.ok(!m.follows.some((f) => f.table), "its table is not used");
  const rodValue = (mm: typeof m) => followAmount(mm.yields![0]!, 0);
  let top = -1e9, bottom = 1e9;
  const seen: number[] = [];
  for (let deg = 1; deg <= 360; deg++) { m = solveContact(scene(s), { ...m, amount: deg }, s.outcome); assert.ok(!m.contact!.jam, `jam at ${deg}: ${m.contact!.jam}`); top = Math.max(top, rodValue(m)); bottom = Math.min(bottom, rodValue(m)); if (deg % 45 === 0) seen.push(+rodValue(m).toFixed(2)); }
  assert.ok(top - bottom > 9 && top - bottom < 10.6, `the rod travels ${top - bottom} mm (twice the offset, 10): ${seen}`);
  assert.ok(Math.abs(rodValue(m)) < 0.3, `and is back where it began after a turn: ${rodValue(m)}; seen ${seen}`);
});
