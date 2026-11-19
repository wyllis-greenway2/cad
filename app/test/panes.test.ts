// The little panes of an orb (`in_1181`, `dec_unified_orb`): a pane between two arrows always sends movement in its plane; a click on one holds the drag to that plane.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { add } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { sectionNow } from "../src/interaction/control/section.ts";
import { BODY_OBJECT } from "../src/compiler/body.ts";
import { hitHandle } from "../src/interaction/gizmo.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const box = (): AppState => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  return { ...createState(s), cam: homeCamera() };
};
const free = (): AppState => reduce(box(), { type: "runAction", id: "view:section" }, env);
const mover = (): AppState => {
  const st = box();
  return reduce({ ...st, session: { ...st.session, click: { ...st.session.click, selection: [BODY_OBJECT] } } }, { type: "begin", name: "move" }, env);
};
const px = (st: AppState, p: Vec3) => projector(st.cam, 800, 600).project(p);
const click = (st: AppState, p: Vec3, shift = false): AppState => { const [x, y] = px(st, p); return reduce(st, { type: "click", x, y, count: 1, shift }, env); };
const drag = (st: AppState, from: Vec3, to: Vec3, steps = 6): AppState => {
  const [x0, y0] = px(st, from); const [x1, y1] = px(st, to);
  let [lx, ly] = [x0, y0];
  for (let k = 1; k <= steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps, y = y0 + ((y1 - y0) * k) / steps;
    st = reduce(st, { type: "orbit", dx: x - lx, dy: y - ly, x, y }, env);
    [lx, ly] = [x, y];
  }
  return reduce(st, { type: "dragEnd" }, env);
};
const paneMiddle = (st: AppState, id: string): Vec3 => { const pts = gizmoOf(st)!.handles.find((h) => h.id === id)!.points; return [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k]!, 0) / pts.length) as unknown as Vec3; };

test("the mover has no little panes (they are the cross section plane's alone, `in_1204`): its handles are the arrows, the sphere and the rings", () => {
  const ids = gizmoOf(mover())!.handles.map((h) => h.id);
  assert.equal(ids.filter((id) => id.startsWith("pane")).length, 0, ids.join());
  assert.deepEqual(ids.filter((id) => id.startsWith("move:")), ["move:x", "move:y", "move:z"]);
});

test("the cross section's mover has its own three panes (clicked to lay the plane across an axis), not the in-plane ones that are dragged", () => {
  const ids = gizmoOf(free())!.handles.filter((h) => h.kind === "pane").map((h) => h.id);
  assert.deepEqual(ids, ["pane:x", "pane:y", "pane:z"]);
});

const arrowMiddle = (st: AppState, id: string): Vec3 => { const pts = gizmoOf(st)!.handles.find((h) => h.id === id)!.points; return [0, 1, 2].map((k) => (pts[0]![k]! + pts[1]![k]!) / 2) as unknown as Vec3; };

test("two arrows chosen with Shift: taking either moves the body freely in the plane of the two, as one step, the third axis does not move, and their numbers show while it goes (`in_1204`)", async () => {
  const { frameOf } = await import("../src/interaction/frame.ts");
  let st0 = mover();
  st0 = click(st0, arrowMiddle(st0, "move:x"), false);
  st0 = click(st0, arrowMiddle(st0, "move:z"), true);
  assert.deepEqual(st0.lockAxes, [0, 2]);
  const steps = scene(st0.session).steps.length;
  const from = arrowMiddle(st0, "move:x");
  const [x0, y0] = px(st0, from);
  const [x1, y1] = px(st0, add(from, [5, 0, 4]));
  let st = st0, [lx, ly] = [x0, y0];
  for (let k = 1; k <= 6; k++) {
    const x = x0 + ((x1 - x0) * k) / 6, y = y0 + ((y1 - y0) * k) / 6;
    st = reduce(st, { type: "orbit", dx: x - lx, dy: y - ly, x, y }, env);
    [lx, ly] = [x, y];
    if (k === 4) {
      const es = frameOf(st, { w: 800, h: 600 }, 0).entries;
      assert.deepEqual(es.map((e) => e.fields[0]!.short).sort(), ["X", "Z"], "the numbers of the two axes it moves along show as it goes");
    }
  }
  st = reduce(st, { type: "dragEnd" }, env);
  assert.equal(scene(st.session).steps.length, steps + 1, "one move step");
  const body = Object.values(scene(st.session).parts).find((p) => p.kind === "body")!;
  const [lo, hi] = [(body as { bbox: { min: Vec3 } }).bbox.min, (body as { bbox: { max: Vec3 } }).bbox.max];
  assert.ok(Math.abs(lo[1]) < 1e-6 && Math.abs(hi[1] - 20) < 1e-6, `y did not change (${lo[1]}..${hi[1]})`);
  assert.ok(lo[0] > 1 && lo[2] > 1, `it moved in x and z (${lo})`);
  assert.deepEqual(st.lockAxes, [0, 2], "the two axes stay chosen for the next drag");
});

test("two axes chosen: the body itself dragged goes where the pointer's ray meets the plane of the two, so the third never moves", () => {
  let st = mover();
  st = click(st, arrowMiddle(st, "move:x"), false);
  st = click(st, arrowMiddle(st, "move:y"), true);
  assert.deepEqual(st.lockAxes, [0, 1]);
  const on: Vec3 = [30, 5, 20];
  st = drag(st, on, add(on, [-8, 5, 0]));
  const { min: lo, max: hi } = bodyBox(st);
  assert.ok(Math.abs(lo[2]) < 1e-6 && Math.abs(hi[2] - 20) < 1e-6, `z did not change (${lo[2]}..${hi[2]})`);
  assert.ok(Math.abs(lo[0]) > 2 || Math.abs(lo[1]) > 1, `it moved in x or y (${lo})`);
});

import { patternValues } from "../src/interaction/pattern.ts";
const withBody = (): AppState => { const st = box(); return { ...st, session: { ...st.session, click: { ...st.session.click, selection: [BODY_OBJECT] } } }; };
const bodyBox = (st: AppState) => { const b = Object.values(scene(st.session).parts).find((p) => p.kind === "body") as { bbox: { min: Vec3; max: Vec3 } }; return b.bbox; };

test("a pane of the scale takes both its axes by the same factor: twice as far from the middle is twice as big in that plane", () => {
  let st = reduce(withBody(), { type: "begin", name: "scale" }, env);
  assert.ok(gizmoOf(st)!.handles.some((h) => h.id === "pane:xy"));
  const from = paneMiddle(st, "pane:xy");
  const c = gizmoOf(st)!.centre;
  const out = add(c, [2 * (from[0] - c[0]), 2 * (from[1] - c[1]), 2 * (from[2] - c[2])]) as Vec3; // twice as far
  st = drag(st, from, out);
  const b = bodyBox(st);
  assert.ok(Math.abs(b.max[0] - b.min[0] - 80) < 1, `x doubled (${b.max[0] - b.min[0]})`);
  assert.ok(Math.abs(b.max[1] - b.min[1] - 40) < 1, `y doubled (${b.max[1] - b.min[1]})`);
  assert.ok(Math.abs(b.max[2] - b.min[2] - 20) < 1e-6, "z is not touched");
});

test("a pane of a linear repeat sets the spacing along its two axes at once", () => {
  let st = reduce(withBody(), { type: "runAction", id: "op:linear" }, env);
  const c = gizmoOf(st)!.centre;
  const from = paneMiddle(st, "pane:xy");
  st = drag(st, from, [c[0] + 50, c[1] + 30, c[2]] as Vec3);
  const v = patternValues(st.repeat!.op);
  assert.ok(Math.abs(v[1]! - 50) < 3, `spacing along x ${v[1]}`);
  assert.ok(Math.abs(v[3]! - 30) < 3, `spacing along y ${v[3]}`);
  assert.ok(st.repeat, "the repeat is still open");
});

test("a pane of a circular repeat takes the pivot point in its plane", () => {
  let st = reduce(withBody(), { type: "runAction", id: "op:circular" }, env);
  const before = patternValues(st.repeat!.op).slice(3, 6);
  const from = paneMiddle(st, "pane:xy");
  st = drag(st, from, add(from, [5, 3, 0]));
  const after = patternValues(st.repeat!.op).slice(3, 6);
  assert.ok(Math.abs(after[2]! - before[2]!) < 1e-6, "the pivot stays at its height");
  assert.ok(Math.hypot(after[0]! - before[0]!, after[1]! - before[1]!) > 1, `and goes in the plane: ${before} to ${after}`);
});
