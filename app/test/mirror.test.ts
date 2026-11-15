// A mirror copy of a drawn figure or a body (`in_433`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawChain } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { BODY_OBJECT } from "../src/compiler/body.ts";

await kernel.init();
const XY = worldRef("XY");
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);
const corners = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at);

/** a block 10 x 6 x 4 from (2, 1, 0) */
function block(): Session {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [2, 1, 0], [12, 7, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 4 } } });
}
const begin = (s: Session, sel: string[]): Op => { const r = startOp(scene(s), sel as never, "mirror"); assert.ok(r.ok, r.ok ? "" : r.why); return (r as { op: Op }).op; };

test("a body is copied as its reflection across the side of its box, joined to it where they touch: the volume doubles and the box is twice as long", () => {
  const s = block();
  const op = begin(s, [BODY_OBJECT]);
  const right = op.mirrorChoices!.findIndex((c) => c.id === "max:0");
  const r = runOp(s, { ...op, mirrorIx: right })!;
  assert.equal(r.session.message, null);
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 2 * 240) < 0.5, `volume ${volume(r.session)}`);
  const bb = r.session.outcome.kernel!.bbox!;
  assert.ok(Math.abs(bb.max[0]! - 22) < 1e-6 && Math.abs(bb.min[0]! - 2) < 1e-6, `${bb.min} ${bb.max}`);
});

test("across the world's plane through the origin the copy is on the other side and stands apart: two bodies", () => {
  const s = block();
  const op = begin(s, [BODY_OBJECT]);
  const w = op.mirrorChoices!.findIndex((c) => c.id === "world:0");
  const r = runOp(s, { ...op, mirrorIx: w })!;
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 480) < 0.5);
  const bb = r.session.outcome.kernel!.bbox!;
  assert.ok(Math.abs(bb.min[0]! + 12) < 1e-6 && Math.abs(bb.max[0]! - 12) < 1e-6, `${bb.min} ${bb.max}`);
});

test("a drawn figure is copied as its reflection: an L of three sides across the world's YZ plane; the copy is a repeat that follows the original", () => {
  let s = createSession(kernel);
  const r = drawChain(scene(s), XY, [[2, 1, 0], [6, 1, 0], [6, 4, 0]]);
  s = run(s, r.command);
  const before = corners(s).length;
  const op = begin(s, [...r.corners, ...r.lines] as string[]);
  assert.equal(op.target, "plane");
  const out = runOp(s, { ...op, mirrorIx: op.mirrorChoices!.findIndex((c) => c.id === "world:0") })!;
  assert.equal(out.session.message, null);
  const after = corners(out.session);
  assert.equal(after.length, before * 2, "a copy of each corner");
  for (const c of [[-2, 1], [-6, 1], [-6, 4]]) assert.ok(after.some((a) => Math.abs(a[0]! - c[0]!) < 1e-9 && Math.abs(a[1]! - c[1]!) < 1e-9), `a corner at ${c}`);
});

test("nothing to mirror is refused; the default plane is the right-hand side of what is selected", () => {
  const s = createSession(kernel);
  assert.equal(startOp(scene(s), [] as never, "mirror").ok, false);
  const op = begin(block(), [BODY_OBJECT]);
  assert.equal(op.mirrorChoices![op.mirrorIx ?? 0]!.id.startsWith("max:"), true);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { homeCamera } from "../src/interaction/camera.ts";
const env = { w: 800, h: 600, now: 0 } as never;

test("the Mirror operation: with the body selected it offers the planes as chips, the picked one is made by Enter as a step of the history", () => {
  const s = block();
  let st = { ...createState({ ...s, click: { ...s.click, selection: [BODY_OBJECT] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "mirror" }, env);
  assert.equal(st.op?.kind, "mirror");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f.mirrorKinds!.map((k) => k.label), ["Left", "Right", "Front", "Back", "Bottom", "Top", "World YZ", "World XZ", "World XY"]);
  assert.ok(f.mirrorKinds!.some((k) => k.on), "one is chosen");
  st = reduce(st, { type: "mirrorKind", index: 5 }, env); // the top
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "pattern");
  assert.equal(step.params.mode, "mirror");
  assert.equal(step.params.nz, 1);
  assert.equal(step.params.pz, 4);
  assert.ok(Math.abs(volume(st.session) - 480) < 0.5);
});
