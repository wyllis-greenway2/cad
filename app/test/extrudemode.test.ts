// An extrusion onto bodies says when it is made whether it adds a piece of its own, joins a body it touches, or cuts, and the step keeps it (`in_295`); the axis button nearest the view lights as the view comes round to it.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { facingOf } from "../src/interaction/frame.ts";
import { homeCamera, lookStraight } from "../src/interaction/camera.ts";

await kernel.init();
const XY = worldRef("XY");
const sketch = (s: Session, x: number, y: number) => { const r = drawSquaredRectangle(scene(s), XY, [x, y, 0], [x + 10, y + 10, 0], [1, 0, 0], [0, 1, 0]); return { s: run(s, r.command), face: loopFaceRef(r.lines), lines: r.lines }; };
function pull(s: Session, face: string): Session {
  const st = startOp(scene(s), [face as never], "extrude");
  if (!st.ok) throw new Error("no extrude");
  const r = runOp(s, { ...st.op, value: 10 });
  assert.ok(r && !r.session.message);
  return r!.session;
}
const modes = (s: Session) => scene(s).steps.filter((x) => x.type === "extrude").map((x) => x.params.mode);

test("an extrusion that stands apart from the body is stored as a piece of its own, one that touches it as joined (`in_295`)", () => {
  let s = createSession(kernel);
  const a = sketch(s, 0, 0); s = pull(a.s, a.face);
  const b = sketch(s, 40, 0); s = pull(b.s, b.face);
  const c = sketch(s, 10, 0); s = pull(c.s, c.face); // (against the first one's side)
  assert.deepEqual(modes(s), [undefined, "new", "add"]); // (the first has nothing to be added to: its mode is not stored)
});

test("the button of the axis the view is nearest to takes the colour as the view comes round to it (`in_295`)", () => {
  const home = facingOf(homeCamera());
  assert.ok(home.strength < 0.6, "at the home view no axis is near");
  const top = facingOf(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]));
  assert.deepEqual([top.axis, top.sign], ["Z", 1]);
  assert.ok(top.strength > 0.99);
  const under = facingOf(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0], -1));
  assert.deepEqual([under.axis, under.sign], ["Z", -1]);
});
