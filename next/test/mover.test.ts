import { test } from "node:test";
import assert from "node:assert/strict";
import { near } from "./helpers.ts";
import { applyDrag, centreOf, choose, heldAxes, newPose, type Pose } from "../src/mover.ts";
import { cross, dot, len, sub, type V3 } from "../src/vec.ts";
import type { Frame } from "../src/planes.ts";

const plane: Frame = { origin: [10, 20, 30], normal: [0, 1, 0], u: [1, 0, 0] };
const local = (f: Frame, p: V3): V3 => { const v = cross(f.normal, f.u), d = sub(p, f.origin); return [dot(d, f.u), dot(d, v), dot(d, f.normal)]; };

test("[O6] a press chooses one arrow; Shift adds straight arrows and takes chosen ones out; a curved arrow is chosen alone", () => {
  let r = choose([], "move:X", false); assert.deepEqual(r, { chosen: ["move:X"], drag: true });
  r = choose(r.chosen, "move:Y", false); assert.deepEqual(r.chosen, ["move:Y"], "a press without Shift lets the others go");
  r = choose(r.chosen, "move:X", true); assert.deepEqual(r.chosen, ["move:Y", "move:X"]);
  r = choose(r.chosen, "move:Z", true); assert.deepEqual(r.chosen, ["move:Y", "move:X", "move:Z"]);
  const keep = choose(r.chosen, "move:X", false); assert.deepEqual(keep.chosen, r.chosen, "a press on a chosen arrow keeps them all, so they are dragged together");
  const out = choose(r.chosen, "move:X", true); assert.deepEqual(out, { chosen: ["move:Y", "move:Z"], drag: false });
  assert.deepEqual(choose(["move:X"], "turn:Z", true).chosen, ["turn:Z"]);
  assert.deepEqual(choose(["turn:Z"], "move:X", true).chosen, ["move:X"]);
  assert.deepEqual(heldAxes(["move:Y", "turn:Z", "move:X"]), [1, 0]);
});

test("[O13] moving the thing takes the orb with it", () => {
  const pose: Pose = { ...newPose(), offset: [3, -2, 5] };
  const r = applyDrag(plane, pose, { move: [4, 0, 1], value: 4 }, 0, false);
  assert.deepEqual(r.frame.origin, [14, 20, 31]);
  assert.deepEqual(r.pose.offset, [3, -2, 5], "the orb is the same offset from the thing");
  assert.deepEqual(centreOf(r.frame, r.pose), [17, 18, 36]);
});

test("[O13] turning the thing turns it about the orb's middle, which stays; the orb keeps its place and its turn relative to the thing", () => {
  const pose: Pose = { ...newPose(), offset: [3, -2, 5] };
  const c0 = centreOf(plane, pose), turn = { axis: [0, 0, 1] as V3, angle: 0.7 };
  const r = applyDrag(plane, pose, { turn, value: 0.7 }, 2, false);
  const c1 = centreOf(r.frame, r.pose);
  for (let i = 0; i < 3; i++) near(c1[i]!, c0[i]!, 1e-9, "the orb's middle did not move");
  const was = local(plane, c0), now = local(r.frame, c1);
  for (let i = 0; i < 3; i++) near(now[i]!, was[i]!, 1e-9, "the orb is where it was in the thing's own axes");
  // its axes turned with the thing: the orb's X, seen from the thing, is as before
  const x0 = local({ ...plane, origin: [0, 0, 0] }, pose.frame[0]!), x1 = local({ ...r.frame, origin: [0, 0, 0] }, r.pose.frame[0]!);
  for (let i = 0; i < 3; i++) near(x1[i]!, x0[i]!, 1e-9);
  near(r.pose.turned[2]!, 0.7, 1e-12); near(len(r.frame.normal), 1, 1e-12);
  const again = applyDrag(plane, r.pose, { turn: { axis: [0, 0, 1], angle: 0.2 }, value: 0.2 }, 2, false);
  near(again.pose.turned[2]!, 0.9, 1e-12);
});

test("[O12] in orient mode the thing stays and only the orb moves or its axes turn", () => {
  const pose = newPose();
  const moved = applyDrag(plane, pose, { move: [5, 0, 0], value: 5 }, 0, true);
  assert.deepEqual(moved.frame, plane, "the thing did not move");
  assert.deepEqual(moved.pose.offset, [5, 0, 0]);
  const turned = applyDrag(plane, pose, { turn: { axis: [0, 0, 1], angle: Math.PI / 2 }, value: Math.PI / 2 }, 2, true);
  assert.deepEqual(turned.frame, plane, "the thing did not turn");
  near(turned.pose.frame[0]![1]!, 1, 1e-9, "the orb's X now points along Y");
  assert.deepEqual(turned.pose.offset, [0, 0, 0]);
});
