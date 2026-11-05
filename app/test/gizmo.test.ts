import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { add, scale, dot, sub } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection, undoLast } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { edgeDirection, paramOnLine, hitHandle } from "../src/interaction/gizmo.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { BODY_OBJECT, cornerName } from "../src/compiler/body.ts";
import { entryOf } from "../src/interaction/entry.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
const near = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const nearV = (a: readonly number[], b: readonly number[], tol = 1e-3) => a.forEach((x, i) => near(x, b[i]!, tol));

/** A 40 x 20 x 20 box standing on the XY plane from (0,0,0), the body selected. */
function box(): AppState {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  return { ...createState(s), cam: homeCamera() };
}
const select = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
/** Press at `from` (a 3D point), move to `to`, let go: what a drag of a handle looks like to the controller. */
function drag(st: AppState, from: Vec3, to: Vec3, steps = 4): AppState {
  const [x0, y0] = px(st, from);
  const [x1, y1] = px(st, to);
  let [lx, ly] = [x0, y0];
  for (let k = 1; k <= steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps;
    const y = y0 + ((y1 - y0) * k) / steps;
    // the first move carries the whole distance since the press (as the recogniser does after the slop)
    const dx = k === 1 ? x - x0 : x - lx;
    const dy = k === 1 ? y - y0 : y - ly;
    st = reduce(st, { type: "orbit", dx, dy, x, y }, env);
    [lx, ly] = [x, y];
  }
  return reduce(st, { type: "dragEnd" }, env);
}
const bbox = (st: AppState) => st.session.outcome.kernel!.bbox!;

test("Move offers X Y Z arrows at the body; dragging one moves the body that way as one step, and the move stays open for another drag", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id), ["move:x", "move:y", "move:z"]);
  nearV(g.centre, [20, 10, 10]);
  const x = g.handles[0]!;
  const mid = scale(add(x.points[0]!, x.points[1]!), 0.5);
  assert.equal(hitHandle(g, projector(st.cam, 800, 600).project, ...px(st, mid))!.id, "move:x");
  assert.equal(hitHandle(g, projector(st.cam, 800, 600).project, 5, 5), null);
  st = drag(st, mid, add(mid, [10, 0, 0]));
  nearV(bbox(st).min, [10, 0, 0]);
  nearV(bbox(st).max, [50, 20, 20]);
  assert.equal(scene(st.session).steps.at(-1)!.type, "move");
  assert.deepEqual(scene(st.session).steps.at(-1)!.params, { axis: 0, value: 10 });
  assert.ok(st.op, "still open: drag again");
  const g2 = gizmoOf(st)!;
  nearV(g2.centre, [30, 10, 10]);
  // drag up the Z arrow
  const z = g2.handles[2]!;
  const zmid = scale(add(z.points[0]!, z.points[1]!), 0.5);
  st = drag(st, zmid, add(zmid, [0, 0, -4]));
  nearV(bbox(st).min, [10, 0, -4]);
  st = undoLast(st.session) && { ...st, session: undoLast(st.session) };
  nearV(bbox(st).min, [10, 0, 0]);
});

test("a drag that does not start on a handle turns the camera; a click does not finish the operation; Esc does", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  const before = st.cam.azimuth;
  st = reduce(st, { type: "orbit", dx: 30, dy: 0, x: 10, y: 10 }, env);
  assert.ok(st.cam.azimuth !== before);
  st = reduce(st, { type: "dragEnd" }, env);
  assert.equal(scene(st.session).steps.length, 1, "no step was made");
  st = reduce(st, { type: "click", x: 300, y: 300, count: 1, shift: false }, env);
  assert.ok(st.op, "a click leaves it open");
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.op, null);
});

function edgeSelected(): { st: AppState; a: Vec3; b: Vec3 } {
  const st = box();
  const line = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && p.a === cornerName([40, 0, 20]) && p.b === cornerName([0, 0, 20]) || (p.kind === "line" && p.origin === "body" && p.b === cornerName([40, 0, 20]) && p.a === cornerName([0, 0, 20])))!;
  return { st: select(st, [line.ref]), a: [40, 0, 20], b: [0, 0, 20] };
}

test("Fillet / chamfer is one operation with a double arrow on the edge: drag out for a fillet of that size, in for a chamfer", () => {
  const { st: st0, a, b } = edgeSelected();
  const sc = scene(st0.session);
  const d = edgeDirection(sc, a, b); // out of the top front edge: toward -Y and up
  nearV(d.map(Math.abs), [0, Math.SQRT1_2, Math.SQRT1_2], 1e-6);
  assert.ok(dot(d, [0, -1, 1]) > 1.3);
  let st = reduce(st0, { type: "begin", name: "edge" }, env);
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => [h.id, h.kind]), [["edge", "double"]]);
  nearV(g.centre, [20, 0, 20]);
  const h = g.handles[0]!;
  const centre = scale(add(h.points[0]!, h.points[1]!), 0.5);
  // out by 2 mm: a fillet of 2
  const out = drag(st, centre, add(centre, scale(d, 2)));
  assert.deepEqual(scene(out.session).steps.at(-1)!.params, { mode: "fillet", value: 2 });
  near(out.session.outcome.kernel!.volume!, 16000 - (1 - Math.PI / 4) * 4 * 40, 0.1);
  // in by 2 mm: a chamfer of 2
  const inn = drag(st, centre, add(centre, scale(d, -2)));
  assert.deepEqual(scene(inn.session).steps.at(-1)!.params, { mode: "chamfer", value: 2 });
  near(inn.session.outcome.kernel!.volume!, 16000 - 0.5 * 4 * 40, 0.1);
  // while dragging the chip says which
  const mid = reduce(st, { type: "orbit", dx: 5, dy: 0, x: px(st, centre)[0] + 5, y: px(st, centre)[1] }, env);
  assert.ok(mid.drag && "handle" in mid.drag);
  const label = entryOf(scene(mid.session), null, mid.op)!.fields[0]!.label;
  assert.ok(label === "Fillet" || label === "Chamfer");
});

test("Rotate offers curved arrows round X Y Z and a ball at the centre; a drag on an arrow turns the body that many degrees about the centre", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id), ["rot:x", "rot:y", "rot:z", "pivot"]);
  const arc = g.handles[2]!;
  const c = g.centre;
  const p = arc.points[10]!;
  const r = sub(p, c);
  const turned: Vec3 = add(c, [-r[1], r[0], 0]); // a quarter turn about +Z
  st = drag(st, p, turned);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "rotate");
  assert.equal(step.params.axis, 2);
  near(Number(step.params.value), 90, 0.6);
  nearV([step.params.px, step.params.py, step.params.pz].map(Number), [20, 10, 10]);
  const bb = bbox(st);
  near(bb.max[0] - bb.min[0], 20, 0.05);
  near(bb.max[1] - bb.min[1], 40, 0.05);
});

test("the rotator's centre can be moved: dragging the ball puts it on the corner you point at, and the next turn is about that point", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  const c = gizmoOf(st)!.centre;
  const corner: Vec3 = [40, 20, 20]; // a corner you can see from here (the far ones are behind the body and cannot be picked)
  st = drag(st, c, corner, 6);
  nearV(st.op!.pivot!, corner);
  assert.equal(scene(st.session).steps.length, 1, "moving the centre is not a step");
  const arc = gizmoOf(st)!.handles[2]!;
  const p = arc.points[10]!;
  const r = sub(p, corner);
  st = drag(st, p, add(corner, [-r[1], r[0], 0]));
  const bb = bbox(st);
  // a quarter turn about the top near corner (40, 20): the 40 x 20 footprint now lies at x 40 to 60 and y -20 to 20
  nearV([bb.min[0], bb.max[0], bb.min[1], bb.max[1]], [40, 60, -20, 20], 0.1);
  assert.equal(frameOf(st, { w: 800, h: 600 }).gizmo!.handles.length, 4);
});

test("fillet / chamfer and the helpers need what they need; the frame carries the handles for the view", () => {
  let st = box();
  st = reduce(st, { type: "begin", name: "move" }, env);
  assert.match(st.session.message ?? "", /select the body/);
  st = select(st, [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.gizmo!.handles.length, 3);
  assert.equal(f.gizmo!.hover, null);
  assert.equal(paramOnLine([0, 0, 0], [1, 0, 0], { o: [0, 5, 5], d: [1, 0, 0] }), null, "looking along the line: no distance");
  assert.deepEqual(selection(st.session), [BODY_OBJECT]);
});
