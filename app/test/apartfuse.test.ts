// The picture of an extrusion while its depth is set is made without the boolean when the figure is apart from the bodies it is near (`in_1011`): it must be what the step made for good gives (bodies, volumes, boxes); the step made for good keeps the boolean.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { kernelStats } from "../src/compiler/kernel/occt/interpreter.mjs";
import { createSession, openSession, previewCommand, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { worldRef } from "../src/shared/ref.ts";

await kernel.init();
const block = (s: Session, x0: number, x1: number, y0: number, y1: number, depth: number): Session => {
  const r = drawRectangle(scene(s), worldRef("XY"), [x0, y0, 0], [x1, y1, 0], [1, 0, 0], [0, 1, 0]);
  const s2 = run(s, r.command);
  return runOp(s2, { ...(startOp(scene(s2), [loopFaceRef(r.lines) as never], "extrude") as { op: Op }).op, value: depth })!.session;
};
const first = (): Session => block(createSession(kernel), 0, 10, 0, 10, 5);
const picture = (s: Session) => { const k = s.outcome.kernel!; return (k.bodies ?? []).map((b) => [Math.round(b.volume * 1e3), b.min.map((v) => Math.round(v * 1e3)), b.max.map((v) => Math.round(v * 1e3))]).sort(); };
const settle = (s: Session) => { assert.ok(s.outcome.kernel && !s.outcome.kernel.stale); return s; };
const opOf = (s: Session, ref: string): Op => (startOp(scene(s), [ref as never], "extrude") as { op: Op }).op;
const ARM = "d/loop@arc@e_023.s0@e_019.p0@e_021.p0+e_019.s0+e_021.s0+e_049.s0";
const arm = () => { const o = openSession(kernel, readFileSync(new URL("./fixtures/arm-clearance-in_1007.cad.json", import.meta.url), "utf8")); assert.ok(o.ok); return o.ok ? o.value : (undefined as never); };
/** the preview of an op as the page asks for it, and the step made for good */
const both = (s: Session, op: Op) => ({ preview: previewCommand(s, opCommand(scene(s), op, { preview: true })!), real: runOp(s, op)!.session });

test("a preview of an arm round a pin, clear of the gear, is the same picture as the step made for good, made without the boolean", () => {
  const s0 = arm();
  const op = { ...opOf(s0, ARM), value: -3.2 };
  const cmd = opCommand(scene(s0), op, { preview: true });
  assert.equal(cmd?.type === "addStep" ? cmd.step.params.preview : null, 1, "the preview step is marked");
  const real = runOp(s0, op)!.session;
  const realCmd = real.history.commands.at(-1);
  assert.equal(realCmd?.type === "addStep" ? realCmd.step.params.preview : undefined, undefined, "the step made for good is not");
  const before = kernelStats.apartSkipped;
  const preview = previewCommand(s0, cmd!)!;
  assert.ok(kernelStats.apartSkipped > before, "the preview was made without the boolean");
  assert.equal(preview.outcome.kernel?.stale, undefined);
  assert.deepEqual(picture({ outcome: preview.outcome } as Session), picture(settle(real)));
});

test("a preview that goes down through the gear still has the cut (the figure is not apart)", () => {
  const s0 = arm();
  const op = { ...opOf(s0, ARM), value: -11.6 };
  const { preview, real } = both(s0, op);
  assert.deepEqual(picture({ outcome: preview!.outcome } as Session), picture(settle(real)));
});

test("block previews: beside, touching, running into and inside another body give the picture the step made for good gives", () => {
  const s0 = first();
  for (const [x0, x1, y0, y1, depth] of [[20, 30, 0, 10, 5], [10, 20, 0, 10, 5], [5, 15, 0, 10, 5], [2, 4, 2, 4, 2]] as const) {
    const r = drawRectangle(scene(s0), worldRef("XY"), [x0, y0, 0], [x1, y1, 0], [1, 0, 0], [0, 1, 0]);
    const s1 = run(s0, r.command);
    const op = { ...(startOp(scene(s1), [loopFaceRef(r.lines) as never], "extrude") as { op: Op }).op, value: depth };
    const { preview, real } = both(s1, op);
    assert.deepEqual(picture({ outcome: preview!.outcome } as Session), picture(settle(real)), `${x0}..${x1}`);
  }
});
