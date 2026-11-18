// The history keeps its latest snapshots whole and the older ones without their body parts (`in_879`): a long history held a scene's worth of body parts for every step, as the square of the steps.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, goToCursor, undoLast, redoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { worldRef } from "../src/shared/ref.ts";

await kernel.init();
const addBox = (s: Session, i: number): Session => {
  const x = (i % 10) * 12, y = Math.floor(i / 10) * 12;
  const r = drawRectangle(scene(s), worldRef("XY"), [x, y, 0], [x + 8, y + 8, 0], [1, 0, 0], [0, 1, 0]);
  const s2 = run(s, r.command);
  return runOp(s2, { ...(startOp(scene(s2), [loopFaceRef(r.lines) as never], "extrude") as { op: Op }).op, value: 5 + (i % 7) })!.session;
};
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body").length;

test("old snapshots lose their body parts, the latest stay whole, and going back to an old one has its bodies again", () => {
  let s = createSession(kernel);
  for (let i = 0; i < 25; i++) s = addBox(s, i);
  const snaps = s.history.snapshots;
  assert.equal(snaps.length, s.history.commands.length + 1);
  assert.equal(snaps[8]!.lean, true, "an old one is lean");
  assert.ok(!Object.values(snaps[8]!.parts).some((p) => p.origin === "body"), "and has no body parts");
  assert.ok(!snaps.at(-1)!.lean, "the latest is whole");
  assert.equal(bodies(s), 25);
  const back = goToCursor(s, 8); // (4 boxes: a sketch and a push each)
  assert.equal(bodies(back), 4, "the bodies of that time are made again");
  assert.ok(!scene(back).lean, "the scene shown is never lean");
  const fwd = goToCursor(back, s.history.commands.length);
  assert.equal(bodies(fwd), 25);
});

test("undo and redo through a long history keep the same bodies at each step", () => {
  let s = createSession(kernel);
  for (let i = 0; i < 20; i++) s = addBox(s, i);
  let u = s;
  for (let k = 0; k < 12; k++) u = undoLast(u);
  assert.equal(bodies(u), 14, "12 commands undone: 6 boxes gone");
  for (let k = 0; k < 12; k++) u = redoLast(u);
  assert.equal(bodies(u), 20);
});
