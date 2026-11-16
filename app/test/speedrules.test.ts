// The speed rules (`dec_speed_rules`, `in_597`): what was made cheaper is still right.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { normalize, cross } from "../src/math/vec.ts";
import type { Vec3 } from "../src/math/vec.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();
const ortho = (d: Vec3): [Vec3, Vec3] => { const u = normalize(cross(Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], d)); return [u, cross(d, u)]; };
const along = (op: Op, p: Vec3, d: Vec3): Op => { const [u, v] = ortho(d); return { ...op, pivot: p, frame: [d, u, v], axis: 0 }; };
const vol = (s: Session) => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? ((p as { volume?: number }).volume ?? 0) : 0), 0);

test("a twisted gear with a bore (the bore is part of the profile, one sweep) measures as the flat gear does: the hole is taken out, not added", () => {
  const spec: GearSpec = { teeth: 20, module: 2, bore: 8 };
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  const face = loopFaceRef(gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines);
  const flat = runOp(s, { ...(startOp(scene(s), [face as never], "extrude") as { op: Op }).op, value: 10 })!.session;
  const op = (startOp(scene(s), [face as never], "revolve") as { op: Op }).op;
  for (const turn of [10, -25]) {
    const twisted = runOp(s, { ...along(op, op.origin!, op.normal!), value: turn, advValue: 10 })!.session;
    assert.equal(twisted.message, null);
    assert.ok(Math.abs(vol(twisted) - vol(flat)) < 1e-4 * vol(flat), `${turn} degrees: ${vol(twisted)} against ${vol(flat)}`);
  }
});

test("a rough answer leaves out the checks, and the whole answer that follows is not taken from it: it is made again, with them", () => {
  const spec: GearSpec = { teeth: 12, module: 2, bore: 5 };
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  const face = loopFaceRef(gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines);
  const op = (startOp(scene(s), [face as never], "extrude") as { op: Op }).op;
  const made = () => runOp(s, { ...op, value: 7 })!.session.outcome.kernel!;
  const mod = (k: ReturnType<typeof made>) => k.ops!.find((o) => o.type === "extrude")! as { checkMs?: number; cached?: boolean };
  kernel.draft = true;
  let rough;
  try { rough = made(); } finally { kernel.draft = false; }
  const whole = made();
  assert.ok(!mod(rough).checkMs, "no check in the rough one");
  assert.ok(!mod(whole).cached, "the whole one was made again");
  assert.ok(Math.abs(rough.volume! - whole.volume!) < 1e-6 * whole.volume!, "the same body");
  assert.ok(mod(made()).cached, "and the checked one is kept");
});

import { gearOutline } from "../src/operation/gear.ts";
test("the Detail of a gear is the arcs to a flank: fewer arcs, fewer sides, nearly the same area; out of 2 to 8 it is refused", () => {
  const side = (detail?: number) => { const r = gearOutline({ teeth: 24, module: 2, ...(detail ? { detail } : {}) }); assert.ok(r.ok); return (r as { value: { points: unknown[]; pitchRadius: number } }).value; };
  assert.equal(side().points.length, side(4).points.length, "4 is the default");
  assert.ok(side(2).points.length < side(4).points.length && side(4).points.length < side(8).points.length);
  assert.equal(side(2).points.length, 24 * (2 * 3 + 2), "two arcs a flank: six points a side of the tooth, and the tip and the root");
  assert.match((gearOutline({ teeth: 24, module: 2, detail: 1 }) as { error: string }).error, /from 2 to 8/);
  assert.match((gearOutline({ teeth: 24, module: 2, detail: 9 }) as { error: string }).error, /from 2 to 8/);
});
