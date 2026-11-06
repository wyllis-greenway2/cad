import test from "node:test";
import { flat } from "./helpers/menu.ts";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { add, scale, dot, sub } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection, undoLast } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { edgeDirection, paramOnLine, hitHandle } from "../src/interaction/gizmo.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { annotationsFor } from "../src/interaction/annotations.ts";
import { candidatesAt } from "../src/interaction/picking.ts";
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
const click = (st: AppState, x: number, y: number) => reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
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
/** The operations the right-click ring offers for what is selected (the ones that can start). */
const ringOps = (st: AppState): string[] => flat(reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items).filter((i) => i.enabled).map((i) => i.id);
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

test("a drag that does not start on a handle turns the camera; a click on a handle does nothing; a click anywhere else, blank space too, leaves the operation", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  const before = st.cam.azimuth;
  st = reduce(st, { type: "orbit", dx: 30, dy: 0, x: 10, y: 10 }, env);
  assert.ok(st.cam.azimuth !== before);
  st = reduce(st, { type: "dragEnd" }, env);
  assert.equal(scene(st.session).steps.length, 1, "no step was made");
  const g = gizmoOf(st)!;
  const onArrow = scale(add(g.handles[0]!.points[0]!, g.handles[0]!.points[1]!), 0.5);
  st = reduce(st, { type: "click", x: px(st, onArrow)[0], y: px(st, onArrow)[1], count: 1, shift: false }, env);
  assert.ok(st.op, "a click on a handle leaves it open");
  st = reduce(st, { type: "click", x: 40, y: 560, count: 1, shift: false }, env);
  assert.equal(st.op, null, "a click in blank space leaves the operation");
  assert.deepEqual(selection(st.session), [], "and lets go of the selection like any click on nothing");
  st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.op, null, "Esc does too");
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
  assert.deepEqual(g.handles.map((h) => [h.id, h.kind]), [["edge:0", "double"]]);
  near(g.centre[0], 10);
  near(g.centre[2], 20); // a quarter of the way along the edge, so the arrow is not under the length bubble at its middle
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
  assert.equal(arc.points.length, 49, "a full circle");
  nearV(arc.points[0]!, arc.points[48]!, 1e-9);
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

const frame = (st: AppState) => frameOf(st, { w: 800, h: 600 });

test("the handles show up by themselves from a click: the body shows its X Y Z arrows, no menu", () => {
  let st = select(box(), [BODY_OBJECT]);
  assert.equal(st.op, null);
  assert.deepEqual(frame(st).gizmo!.handles.map((h) => h.id), ["move:x", "move:y", "move:z"]);
  const g = gizmoOf(st)!;
  const x = g.handles[0]!;
  const mid = scale(add(x.points[0]!, x.points[1]!), 0.5);
  st = drag(st, mid, add(mid, [8, 0, 0]));
  nearV(bbox(st).min, [8, 0, 0]);
  assert.equal(st.op, null, "it ends with the drag: nothing is left open");
  assert.deepEqual(selection(st.session), [BODY_OBJECT]);
  nearV(frame(st).gizmo!.handles[0]!.points[0]!, [28, 10, 10], 1e-3);
});

test("the arrows follow the object live while it is dragged", () => {
  let st = select(box(), [BODY_OBJECT]);
  const g = gizmoOf(st)!;
  const x = g.handles[0]!;
  const mid = scale(add(x.points[0]!, x.points[1]!), 0.5);
  const [x0, y0] = px(st, mid);
  const [x1, y1] = px(st, add(mid, [6, 0, 0]));
  st = reduce(st, { type: "orbit", dx: x1 - x0, dy: y1 - y0, x: x1, y: y1 }, env);
  assert.ok(st.drag && "handle" in st.drag);
  near(st.op!.value!, 6, 0.11);
  nearV(frame(st).gizmo!.handles[0]!.points[0]!, [26, 10, 10], 0.2);
  assert.equal(scene(st.session).steps.length, 1, "and nothing is done until the drag ends");
});

test("a closed figure shows the arrow to pull it out; the same arrow on a flat face of the body pushes and pulls it", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st = { ...createState(s), cam: homeCamera() };
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref;
  st = select(st, [face]);
  assert.ok(frame(st).gizmo, "a sketch plane shows the pull arrow by itself");
  assert.ok(ringOps(st).includes("op:pushpull"), "and the right-click ring offers push / pull for it");
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.kind, "extrude", "the same operation");
  const h = frame(st).gizmo!.handles;
  assert.deepEqual(h.map((q) => q.id), ["pull"]);
  nearV(scale(add(h[0]!.points[0]!, h[0]!.points[1]!), 0.5), [20, 10, 0]);
  assert.equal(h[0]!.kind, "double", "the arrow points both ways: out to pull, in to push");
  nearV(sub(h[0]!.points[1]!, h[0]!.points[0]!).map((v, i) => (i < 2 ? Math.abs(v) : v / Math.abs(v || 1))), [0, 0, 1], 1e-6);
  const mid = scale(add(h[0]!.points[0]!, h[0]!.points[1]!), 0.5);
  st = drag(st, mid, add(mid, [0, 0, 12]));
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 12, 0.5);
  assert.deepEqual(selection(st.session), [], "after an extrude nothing is selected");
  st = reduce(st, { type: "escape" }, env); // leave the extrude
  // the top face of the new body: push it in 5 (cut) and pull it out 3 (add)
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 12)!;
  st = select(st, [top.ref]);
  assert.ok(frame(st).gizmo, "a face shows the push / pull arrow by itself");
  assert.ok(ringOps(st).includes("op:pushpull"), "push / pull is in the right-click ring too");
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.deepEqual(frame(st).gizmo!.handles.map((q) => q.id), ["pull"]);
  const pg = gizmoOf(st)!.handles[0]!;
  const pm = scale(add(pg.points[0]!, pg.points[1]!), 0.5);
  const pulled = drag(st, pm, add(pm, [0, 0, 3]));
  near(pulled.session.outcome.kernel!.volume!, 40 * 20 * 15, 0.5);
  assert.equal(scene(pulled.session).steps.at(-1)!.type, "pushPull");
  const pushed = drag(st, pm, add(pm, [0, 0, -5]));
  near(pushed.session.outcome.kernel!.volume!, 40 * 20 * 7, 0.5);
  // typing a number does the same as dragging it that far
  const typed = reduce(typeText(st, "16"), { type: "typed", key: "Enter", shift: false }, env); // the size you want: 16 thick
  near(typed.session.outcome.kernel!.volume!, 40 * 20 * 16, 0.5);
});

const typeText = (st: AppState, text: string) => [...text].reduce((a, c) => reduce(a, { type: "typed", key: c, shift: false }, env), st);

test("a line of the body shows the fillet / chamfer double arrow by itself; several lines each show one, and the size dragged on any applies to all", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2]);
  st = select(st, vertical.map((p) => p.ref));
  assert.ok(ringOps(st).includes("op:edge"), "fillet / chamfer is in the right-click ring too");
  const g = gizmoOf(st)!; // and the arrows show up by themselves
  assert.equal(g.handles.length, 4);
  assert.ok(g.handles.every((h) => h.kind === "double"));
  const h = g.handles[1]!;
  const centre = scale(add(h.points[0]!, h.points[1]!), 0.5);
  const d = sub(h.points[1]!, h.points[0]!);
  const unit = scale(d, 1 / Math.hypot(...d));
  const done = drag(st, centre, add(centre, scale(unit, 2)));
  assert.deepEqual(scene(done.session).steps.at(-1)!.params, { mode: "fillet", value: 2 });
  assert.equal(scene(done.session).steps.at(-1)!.parts.length, 4, "all four edges at once");
  near(done.session.outcome.kernel!.volume!, 16000 - 4 * (1 - Math.PI / 4) * 4 * 20, 0.2);
});

test("Scale has a handle: pull the ball at the corner out to make the body bigger", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "scale" }, env);
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.kind), ["scale"]);
  const [c, corner] = g.handles[0]!.points;
  nearV(c!, [20, 10, 10]);
  nearV(corner!, [40, 20, 20]);
  const out: Vec3 = add(c!, scale(sub(corner!, c!), 2)); // twice as far from the centre
  st = drag(st, corner!, out, 6);
  near(Number(scene(st.session).steps.at(-1)!.params.value), 2, 0.02);
  const bb = bbox(st);
  near(bb.max[0] - bb.min[0], 80, 0.5);
});

test("a drawn figure moves and turns like an object: X Y Z arrows, X Y Z rings and angle fields, taking its plane with it", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st = { ...createState(s), cam: homeCamera() };
  const faceRef = () => Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref;
  const cornersOf = () => Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at);
  st = select(st, [faceRef()]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id), ["move:x", "move:y", "move:z"], "the same arrows as an object");
  const x = g.handles[0]!;
  const mid = scale(add(x.points[0]!, x.points[1]!), 0.5);
  st = drag(st, mid, add(mid, [7, 0, 0]));
  near(Math.min(...cornersOf().map((c) => c[0])), 7, 0.15);
  near(Math.max(...cornersOf().map((c) => c[0])), 47, 0.15);
  // up out of the world plane: the figure takes a plane of its own at the new height
  st = reduce(st, { type: "entry", field: 0, text: "5" }, env);
  st = reduce({ ...st, op: { ...st.op!, axis: 2 } }, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  near(Math.min(...cornersOf().map((c) => c[2])), 5, 1e-6);
  const pl = scene(st.session).parts[Object.values(scene(st.session).parts).find((p) => p.kind === "corner" && p.origin === "drawn")!.plane!];
  assert.ok(pl && pl.kind === "plane" && pl.origin === "drawn", "a plane of its own");
  assert.notEqual(pl!.ref, XY);
  nearV((pl as { at: Vec3 }).at, [7, 0, 5]);
  st = { ...st, op: null };
  // turning: three rings and the angle fields (0 0 0 for a figure lying flat), 90 about Z by typing
  st = select(st, [faceRef()]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  assert.deepEqual(gizmoOf(st)!.handles.map((h) => h.id), ["rot:x", "rot:y", "rot:z", "pivot"]);
  assert.deepEqual(frame(st).entry!.fields.map((f) => [f.label, f.value]), [["X", "0"], ["Y", "0"], ["Z", "0"]]);
  st = reduce(st, { type: "entry", field: 2, text: "90" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const xs = cornersOf().map((q) => q[0]);
  const ys = cornersOf().map((q) => q[1]);
  near(Math.max(...xs) - Math.min(...xs), 20, 0.01);
  near(Math.max(...ys) - Math.min(...ys), 40, 0.01);
  st = select({ ...st, op: null }, [faceRef()]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  assert.deepEqual(frame(st).entry!.fields.map((f) => [f.label, f.value]), [["X", "0"], ["Y", "0"], ["Z", "90"]], "it shows how the figure is turned now");
  // turn it up on its edge about X: it stands on end, its plane turns with it
  st = reduce(st, { type: "entry", field: 0, text: "90" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const zs = cornersOf().map((q) => q[2]);
  assert.ok(Math.max(...zs) - Math.min(...zs) > 15, "it stands up");
});

/** Push (or pull) the body face with this outward normal and plane offset by `d`, through the same bubble and typed number a person uses. */
function push(st: AppState, n: Vec3, off: number, d: number): AppState {
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs(dot(normalOf(p), n) - 1) < 1e-6 && Math.abs(dot(p.at, n) - off) < 1e-3)!;
  assert.ok(face, `a face with normal ${n} at ${off}`);
  st = select(st, [face.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = reduce(st, { type: "entry", field: 0, text: String(st.op!.dim!.base + d) }, env); // the bubble takes the size you want: how thick the body is now plus the push
  return reduce(st, { type: "typed", key: "Enter", shift: false }, env);
}
const normalOf = (p: { u: Vec3; v: Vec3 }): Vec3 => { const [a, b] = [p.u, p.v]; return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };

test("push a face, then a perpendicular face: the first push stays (steps are kept whatever the body looks like now)", () => {
  let st = box(); // 40 x 20 x 20
  st = push(st, [0, 0, 1], 20, 5); // top up 5: 40 x 20 x 25
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 25, 0.5);
  st = push(st, [1, 0, 0], 40, 5); // the +x end out 5: 45 x 20 x 25
  assert.deepEqual(st.session.outcome.errors, {});
  near(st.session.outcome.kernel!.volume!, 45 * 20 * 25, 0.5);
  st = push(st, [0, 1, 0], 20, -5); // the +y side in 5: 45 x 15 x 25
  assert.deepEqual(st.session.outcome.errors, {});
  near(st.session.outcome.kernel!.volume!, 45 * 15 * 25, 0.5);
});

test("push a face after the body was rotated", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "90" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.deepEqual(st.session.outcome.errors, {});
  const bb = st.session.outcome.kernel!.bbox!;
  const top = Object.values(scene(st.session).parts).filter((p) => p.kind === "plane" && p.origin === "body");
  assert.ok(top.length >= 6);
  const before = st.session.outcome.kernel!.volume!;
  const face = top.find((p) => normalOf(p as never)[0] > 0.99)!; // whichever face now points along +x
  st = select(st, [face.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = reduce(st, { type: "entry", field: 0, text: String(st.op!.dim!.base + 3) }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.deepEqual(st.session.outcome.errors, {});
  assert.ok(st.session.outcome.kernel!.volume! > before + 1, `volume grew from ${before} (bbox ${JSON.stringify(bb)})`);
});

test("push a face of a body turned by an angle that is not a right angle", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "30" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const before = st.session.outcome.kernel!.volume!;
  const faces = Object.values(scene(st.session).parts).filter((p) => p.kind === "plane" && p.origin === "body");
  const face = faces.find((p) => Math.abs(normalOf(p as never)[2]) > 0.5 && Math.abs(normalOf(p as never)[2]) < 0.99) ?? faces[0]!;
  st = select(st, [face.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = reduce(st, { type: "entry", field: 0, text: String(st.op!.dim!.base + 2) }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.deepEqual(st.session.outcome.errors, {});
  assert.ok(st.session.outcome.kernel!.volume! > before + 1);
});

test("after a pull the arrow stays on the new face and the value stays (the whole operation is one step that each drag changes)", () => {
  let st = select(box(), []);
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  st = select(st, [top.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(frame(st).entry!.fields[0]!.value, "20", "the bubble shows the size: the block is 20 thick");
  const g0 = gizmoOf(st)!.handles[0]!;
  const mid0 = scale(add(g0.points[0]!, g0.points[1]!), 0.5);
  st = drag(st, mid0, add(mid0, [0, 0, 4]));
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 24, 0.5);
  const g1 = gizmoOf(st)!.handles[0]!;
  const mid1 = scale(add(g1.points[0]!, g1.points[1]!), 0.5);
  nearV(mid1, [20, 10, 24]);
  assert.equal(frame(st).entry!.fields[0]!.value, "24", "the size stays after you let go");
  st = drag(st, mid1, add(mid1, [0, 0, 2])); // 2 more: 6 in all
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 26, 0.5);
  assert.equal(frame(st).entry!.fields[0]!.value, "26");
  assert.equal(scene(st.session).steps.length, 2, "the box and one push / pull, however many drags");
  const mid2 = scale(add(gizmoOf(st)!.handles[0]!.points[0]!, gizmoOf(st)!.handles[0]!.points[1]!), 0.5);
  st = drag(st, mid2, add(mid2, [0, 0, -3])); // back by 3: 3 in all
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 23, 0.5);
  // a number typed in the bubble is the size you want
  st = reduce(st, { type: "entry", field: 0, text: "30" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 30, 0.5);
  assert.equal(scene(st.session).steps.length, 2);
  assert.equal(st.op, null);
});

test("the fillet / chamfer arrows stay after a drag, and the size is the total, until you click away", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2]);
  // (an edge whose arrow is seen across the screen: one seen end-on follows the pointer at a steady rate instead of along its own line)
  const seen = (ref: string) => { const g = gizmoOf(reduce(select(st, [ref]), { type: "begin", name: "edge" }, env))!.handles[0]!; const [a, b] = [px(st, g.points[0]!), px(st, g.points[1]!)]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
  const edge = vertical.map((p) => p.ref).sort((a, b) => seen(b) - seen(a))[0]!;
  st = select(st, [edge]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  let h = gizmoOf(st)!.handles[0]!;
  const dirOf = (q: typeof h) => { const d = sub(q.points[1]!, q.points[0]!); return scale(d, 1 / Math.hypot(...d)); };
  const centre = (q: typeof h) => scale(add(q.points[0]!, q.points[1]!), 0.5);
  st = drag(st, centre(h), add(centre(h), scale(dirOf(h), 1)));
  assert.ok(gizmoOf(st), "the arrow is still there");
  h = gizmoOf(st)!.handles[0]!;
  assert.equal(frame(st).entry!.fields[0]!.value, "1");
  st = drag(st, centre(h), add(centre(h), scale(dirOf(h), 1))); // another 1: 2 in all
  assert.equal(frame(st).entry!.fields[0]!.value, "2");
  assert.deepEqual(scene(st.session).steps.at(-1)!.params, { mode: "fillet", value: 2 });
  assert.equal(scene(st.session).steps.length, 2, "one step however many drags");
  st = click(st, 700, 560);
  assert.equal(st.op, null, "a click in blank space ends the operation");
});

test("a round face can be selected, and push / pull changes its radius (a post grows, a hole shrinks as it is pulled)", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const round = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.curved)!;
  assert.ok(round, "the round face is a part");
  near(st.session.outcome.kernel!.volume!, Math.PI * 100 * 20, 1);
  st = select(st, [round.ref]);
  assert.ok(ringOps(st).includes("op:pushpull"), "it offers push / pull");
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "24" }, env); // a diameter of 24: the radius goes from 10 to 12
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.deepEqual(st.session.outcome.errors, {});
  near(st.session.outcome.kernel!.volume!, Math.PI * 144 * 20, 2);
});

test("rotation has three angles X Y Z: they show how the body is turned now, and each can be set on its own", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  const fields = (s: AppState) => frame(s).entry!.fields.map((f) => [f.label, f.value]);
  assert.deepEqual(fields(st), [["X", "0"], ["Y", "0"], ["Z", "0"]]);
  // turn it 90 degrees about Z by typing it in the Z field
  st = reduce(st, { type: "entry", field: 2, text: "90" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near(bbox(st).max[0]! - bbox(st).min[0]!, 20, 0.05);
  near(bbox(st).max[1]! - bbox(st).min[1]!, 40, 0.05);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  assert.deepEqual(fields(st), [["X", "0"], ["Y", "0"], ["Z", "90"]], "it shows how it is turned now");
  // set X on its own to 30: Z stays 90
  st = reduce(st, { type: "entry", field: 0, text: "30" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  assert.deepEqual(fields(st), [["X", "30"], ["Y", "0"], ["Z", "90"]]);
  // and a drag of a ring is shown live in the three
  const ring = gizmoOf(st)!.handles.find((h) => h.id === "rot:z")!;
  assert.ok(ring);
});

test("a drawn figure can be scaled about its middle: corners go out, a circle's radius changes", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref;
  st = select(st, [face]);
  st = reduce(st, { type: "begin", name: "scale" }, env);
  assert.deepEqual(gizmoOf(st)!.handles.map((h) => h.kind), ["scale"]);
  st = reduce(st, { type: "entry", field: 0, text: "2" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const xs = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner").map((p) => (p as { at: Vec3 }).at[0]);
  const ys = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at[1]);
  near(Math.max(...xs) - Math.min(...xs), 80, 0.01);
  near(Math.max(...ys) - Math.min(...ys), 40, 0.01);
  // a circle
  let c = createSession(kernel);
  const circ = drawCircle(scene(c), XY, [5, 5, 0], 10);
  c = run(c, circ.command);
  let cs: AppState = { ...createState(c), cam: homeCamera() };
  cs = select(cs, [Object.values(scene(cs.session).parts).find((p) => p.kind === "face")!.ref]);
  cs = reduce(cs, { type: "begin", name: "scale" }, env);
  cs = reduce(cs, { type: "entry", field: 0, text: "1.5" }, env);
  cs = reduce(cs, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(cs.session.message, null);
  near((Object.values(scene(cs.session).parts).find((p) => p.kind === "circle") as { radius: number }).radius, 15, 1e-6);
});

test("dragging a corner of a drawing resizes the figure: the rectangle stays a rectangle, and the whole drag is one undo", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const before = Object.keys(st.session.history.commands ?? {}).length;
  st = drag(st, [40, 20, 0], [55, 30, 0], 6);
  const cs = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner").map((p) => (p as { at: Vec3 }).at);
  near(Math.max(...cs.map((c) => c[0])) - Math.min(...cs.map((c) => c[0])), 55, 0.5);
  near(Math.max(...cs.map((c) => c[1])) - Math.min(...cs.map((c) => c[1])), 30, 0.5);
  assert.equal(new Set(cs.map((c) => Math.round(c[0] * 100))).size, 2, "still a rectangle");
  void before;
  st = { ...st, session: undoLast(st.session) };
  const back = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner").map((p) => (p as { at: Vec3 }).at);
  near(Math.max(...back.map((c) => c[0])), 40, 0.01);
});

test("several flat faces can be pushed or pulled at once by the same distance", () => {
  let st = box(); // 40 x 20 x 20
  const faceAt = (n: Vec3, off: number) => Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs(dot(normalOf(p), n) - 1) < 1e-6 && Math.abs(dot(p.at, n) - off) < 1e-3)!.ref;
  st = select(st, [faceAt([0, 0, 1], 20), faceAt([1, 0, 0], 40)]);
  assert.ok(ringOps(st).includes("op:pushpull"));
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "5" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.deepEqual(st.session.outcome.errors, {});
  near(st.session.outcome.kernel!.volume!, 45 * 20 * 25, 0.5);
});

test("a curved edge of the body (the rim of a post) is picked along its curve, not along its chord", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  const st: AppState = { ...createState(s), cam: homeCamera() };
  const arcs = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && p.mid && p.mid[2] === 20);
  assert.ok(arcs.length >= 1, "the rim is a line with a middle");
  const arc = arcs.find((p) => p.kind === "line" && p.mid![1] > 0)!;
  const [x, y] = px(st, (arc as { mid: Vec3 }).mid);
  const hit = candidatesAt(scene(st.session), projector(st.cam, env.w, env.h).view(x, y), { pointTol: 4, lineTol: 4 }).filter((q) => q.kind === "line");
  assert.equal(hit[0]?.ref, arc.ref);
});

test("other curved faces (a fillet, a cone, a turned post) can be selected too, and offer nothing they cannot do", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2])!;
  st = select(st, [vertical.ref]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const round = Object.values(scene(st.session).parts).filter((p) => p.kind === "plane" && p.origin === "body" && (p.rounded || p.curved));
  assert.ok(round.length >= 1, "the fillet's surface is a part");
  st = select(st, [round[0]!.ref]);
  assert.ok(!ringOps(st).includes("op:pushpull"), "a fillet face cannot be pushed or pulled yet");
  assert.ok(frame(st).highlight.selection.includes(round[0]!.ref));
});

test("the ⋯ menu opens a list of the bodies with their names and a list of the history steps; a step can be taken out", () => {
  let st = box();
  assert.equal(frame(st).panel, null);
  st = reduce(st, { type: "panel", name: "bodies" }, env);
  assert.deepEqual(frame(st).panel!.rows.map((r) => r.label), ["Body 1"]);
  st = reduce(st, { type: "panelRow", id: frame(st).panel!.rows[0]!.id, act: "select" }, env);
  assert.deepEqual(selection(st.session), [BODY_OBJECT]);
  assert.equal(frame(st).panel!.rows[0]!.active, true);
  st = reduce(st, { type: "panel", name: "history" }, env);
  assert.deepEqual(frame(st).panel!.rows.map((r) => r.label), ["Extrude 20 mm"]);
  st = reduce(st, { type: "panel", name: "history" }, env);
  assert.equal(frame(st).panel, null, "choosing it again closes it");
  st = reduce(st, { type: "panel", name: "history" }, env);
  st = reduce(st, { type: "panelRow", id: frame(st).panel!.rows[0]!.id, act: "remove" }, env);
  assert.equal(st.session.outcome.kernel, null, "taking the step out takes the body away");
  assert.deepEqual(frame(st).panel!.rows, []);
});

test("the arrow of a selected face has its size bubble at once; typing a size makes the block exactly that: a 40 x 20 x 20 block becomes a 20 mm cube", () => {
  let st = box();
  const faceAt = (n: Vec3, off: number) => Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs(dot(normalOf(p), n) - 1) < 1e-6 && Math.abs(dot(p.at, n) - off) < 1e-3)!.ref;
  st = select(st, [faceAt([1, 0, 0], 40)]);
  assert.ok(frame(st).gizmo, "the arrow shows by itself");
  assert.equal(frame(st).entry!.fields[0]!.value, "40", "and the bubble says how thick the block is across that face");
  st = reduce(st, { type: "entry", field: 0, text: "20" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.deepEqual(st.session.outcome.errors, {});
  near(st.session.outcome.kernel!.volume!, 20 * 20 * 20, 0.5);
  const b = bbox(st);
  near(b.max[0]! - b.min[0]!, 20); near(b.max[1]! - b.min[1]!, 20); near(b.max[2]! - b.min[2]!, 20);
});

test("the length of a line of the body can be set like a sketch line's: the face at its end is pushed or pulled", () => {
  let st = box(); // 40 x 20 x 20
  const sc = scene(st.session);
  const along = (p: { kind: string; a?: string; b?: string }, i: number) => p.kind === "line" && Math.abs((sc.parts[p.a as never] as { at: Vec3 }).at[i]! - (sc.parts[p.b as never] as { at: Vec3 }).at[i]!) > 1;
  const xLine = Object.values(sc.parts).find((p) => p.kind === "line" && p.origin === "body" && along(p, 0))!;
  st = select(st, [xLine.ref]);
  const m = frame(st).annotations.find((a) => a.id === "measure")!;
  near(m.value!, 40);
  assert.equal(m.editable, true, "it can be typed over like a sketch line's length");
  st = reduce(st, { type: "relation", act: "measure", id: null, value: 30 }, env);
  assert.equal(st.session.message, null);
  near(st.session.outcome.kernel!.volume!, 30 * 20 * 20, 0.5);
  near(bbox(st).max[0]! - bbox(st).min[0]!, 30);
});

// ---- a model with a bore, a cross hole and rounded edges (found by the human, `in_136`) ----
import { readFileSync } from "node:fs";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { planeForDrawing } from "../src/interaction/tools.ts";
import type { Op } from "../src/interaction/operations.ts";
import { openSession } from "../src/interaction/session.ts";
import { projector as proj, position } from "../src/interaction/camera.ts";
import { outlineOf } from "../src/operation/part.ts";
import { lookup } from "../src/operation/scene.ts";
const channel = () => { const r = openSession(kernel, readFileSync(new URL("./fixtures/channel-block.cad.json", import.meta.url), "utf8")); assert.ok(r.ok); return r.value; };

test("every face of the body is a part: two separate faces in one plane (an end cut in two by a hole) are both there and both selectable", () => {
  const s = channel();
  const mesh = s.outcome.kernel!.mesh!;
  const inParts = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body").reduce((n, p) => n + ((p as { mesh?: number[] }).mesh?.length ?? 0) / 9, 0);
  assert.equal(inParts, mesh.triangles.length / 3, "no face is left out (one used to hide another with the same plane)");
  const ends = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && Math.abs(dot(p.at, [1, 0, 0]) - 13.5) < 1e-6);
  assert.equal(ends.length, 2, "the end at x = 13.5 is two faces");
  assert.equal(new Set(ends.map((p) => p.ref)).size, 2, "with two names");
});

test("a round face pushed or pulled leaves no paper-thin sheet of its old wall (the hole of the model grows clean)", () => {
  let s = channel();
  const cyl = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.curved)!;
  const st = startOp(scene(s), [cyl.ref], "pushpull");
  assert.ok(st.ok);
  s = run(s, opCommand(scene(s), { ...(st as { op: Op }).op, value: -1.2 })!);
  assert.deepEqual(s.outcome.errors, {});
  const old = (s.outcome.kernel!.faces ?? []).filter((f) => f.type === "cyl" && Math.abs((f.radius as number) - 0.6851) < 0.01);
  assert.equal(old.length, 0, "the old wall is gone");
  const wide = (s.outcome.kernel!.faces ?? []).filter((f) => f.type === "cyl" && Math.abs((f.radius as number) - 1.8851) < 0.01);
  assert.equal(wide.length, 1, "the hole is now 1.2 wider all round");
});

test("a line behind the body is not picked through it", () => {
  const s = channel();
  const sc = scene(s);
  const get = lookup(sc);
  const m = s.outcome.kernel!.mesh!;
  const blocked = (o: Vec3, d: Vec3, tmax: number) => {
    for (let i = 0; i < m.triangles.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => { const ix = m.triangles[i + k]!; return [m.vertices[ix * 3]!, m.vertices[ix * 3 + 1]!, m.vertices[ix * 3 + 2]!] as Vec3; }) as [Vec3, Vec3, Vec3];
      const e1 = sub(b, a); const e2 = sub(c, a);
      const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]] as Vec3;
      const det = dot(e1, p);
      if (Math.abs(det) < 1e-12) continue;
      const t0 = sub(o, a);
      const u = dot(t0, p) / det;
      if (u < 0 || u > 1) continue;
      const q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]] as Vec3;
      const v = dot(d, q) / det;
      if (v < 0 || u + v > 1) continue;
      const t = dot(e2, q) / det;
      if (t > 1e-3 && t < tmax - 0.02) return true;
    }
    return false;
  };
  let bad = 0;
  for (const az of [0.3, 1.2, 2.5, 4, 5.2]) for (const el of [0.2, 0.6, 1.1, -0.5]) {
    const cam = { ...homeCamera(), target: [6.7, 12, 11] as Vec3, azimuth: az, elevation: el, distance: 45, straight: false };
    const pr = proj(cam, 800, 600);
    const eye = position(cam);
    for (const p of Object.values(sc.parts)) {
      if (p.kind !== "line" || p.origin !== "body") continue;
      const o = outlineOf(get, p);
      const q = o.shape === "segment" ? ([(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2, (o.a[2] + o.b[2]) / 2] as Vec3) : o.shape === "polyline" ? o.pts[Math.floor(o.pts.length / 2)]! : null;
      if (!q) continue;
      const [x, y] = pr.project(q);
      const hit = candidatesAt(sc, pr.view(x, y)).find((c) => c.kind === "line");
      if (!hit || hit.ref !== p.ref) continue;
      const d = sub(q, eye);
      const L = Math.hypot(...d);
      if (blocked(eye, scale(d, 1 / L), L)) bad++;
    }
  }
  assert.equal(bad, 0, "no line was picked while the body hid it");
});

test("looking straight at a plane (orthographic) the push / pull arrow and its bubble are not shown", () => {
  let st = box();
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  st = select(st, [top.ref]);
  assert.ok(frame(st).gizmo, "in perspective it shows");
  st = { ...st, cam: { ...st.cam, straight: true } };
  assert.equal(frame(st).gizmo, null, "straight on it goes away");
  assert.equal(frame(st).entry, null);
  st = { ...st, cam: { ...st.cam, straight: false } };
  assert.ok(frame(st).gizmo);
});

test("a figure drawn in the open (on a world plane, away from the body) and pulled backwards makes a new piece, not a cut that does nothing", () => {
  let st = box(); // 40 x 20 x 20 at the origin
  const XZ = worldRef("XZ");
  const r = drawSquaredRectangle(scene(st.session), XZ, [100, 0, 100], [110, 0, 110], [1, 0, 0], [0, 0, 1]);
  let s = run(st.session, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: -10 } } });
  assert.deepEqual(s.outcome.errors, {});
  near(s.outcome.kernel!.volume!, 16000 + 10 * 10 * 10, 1);
  // and a pocket into the body (a figure drawn on its top face and pushed in) is still a pocket
  const top = Object.values(scene(s).parts).find((q) => q.kind === "plane" && q.origin === "body" && q.at[2] === 20)!;
  const pf = planeForDrawing(scene(s), top.ref);
  s = run(s, pf.command!);
  const pl = scene(s).parts[pf.plane] as { u: Vec3; v: Vec3 };
  const p = drawSquaredRectangle(scene(s), pf.plane, [10, 5, 20], [20, 10, 20], pl.u, pl.v);
  s = run(s, p.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: p.lines, params: { depth: -5 } } });
  near(s.outcome.kernel!.volume!, 16000 + 1000 - 10 * 5 * 5, 1);
});

test("the two-body model: both later extrudes add their piece", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/two-bodies.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  assert.deepEqual(r.value.outcome.errors, {});
  const steps = scene(r.value).steps;
  assert.equal(steps.at(-1)!.id, "s_056");
  assert.ok(r.value.outcome.kernel!.volume! > 3000, `the new pieces are there (${r.value.outcome.kernel!.volume})`);
});

test("a curved surface says what its number is: Ø for the diameter of a round post or hole, R for the radius of a fillet", () => {
  const s = channel();
  const sc = scene(s);
  const fillet = Object.values(sc.parts).find((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE" && Math.abs((p.radius ?? 0) - 1.9) < 1e-3)!;
  const r = annotationsFor(sc, [fillet.ref], null).find((a) => a.id === "radius")!;
  assert.ok(r);
  assert.equal(r.symbol, "R");
  near(r.value!, 1.9, 1e-3);
  assert.equal(r.readOnly, true);
  // the bore (a full round hole): its push / pull bubble is the diameter, Ø
  const bore = Object.values(sc.parts).find((p) => p.kind === "plane" && p.curved)!;
  let st: AppState = { ...createState(s), cam: homeCamera() };
  st = select(st, [bore.ref]);
  const f = frame(st).entry!.fields[0]!;
  assert.equal(f.short, "Ø");
  assert.equal(f.label, "Diameter");
  near(Number(f.value), 2 * 0.6851, 0.01);
});

test("a circle's diameter bubble carries Ø", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 5);
  s = run(s, c.command);
  s = run(s, { type: "addRelation", relation: { id: "r_900", kind: "diameter", parts: [c.circle], value: 10, locked: true } });
  const a = annotationsFor(scene(s), [c.circle], null).find((x) => x.kind === "diameter")!;
  assert.equal(a.symbol, "Ø");
});


// ---- a repeat being set up (`in_141`): Apply and Cancel at the top, the numbers in bubbles, handles, the pivot as parts of the scene ----
const apply = (st: AppState) => reduce(st, { type: "repeatApply" }, env);
const bubbles = (st: AppState) => frame(st).entries.map((e) => e.fields.map((f) => f.value));

test("a linear repeat of the body: a count and a distance bubble on each axis, arrows to pull, the result shows as you go; it ends only with Apply or Cancel", () => {
  let st = select(box(), [BODY_OBJECT]); // 40 x 20 x 20
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.ok(st.repeat && !st.op, "a repeat is open, and it is not an operation");
  assert.equal(frame(st).bar, true, "the Apply and Cancel buttons are up");
  assert.deepEqual(bubbles(st), [["3", "60"], ["1", "30"], ["1", "30"]], "three bubbles, one on each axis");
  assert.deepEqual(frame(st).entries.map((e) => e.fields.map((f) => f.short)), [["X×", "Δ"], ["Y×", "Δ"], ["Z×", "Δ"]]);
  near(frame(st).mesh!.vertices.reduce((m, v, i) => (i % 3 === 0 ? Math.max(m, v) : m), -1e9), 40 + 2 * 60, 0.01); // the preview is the real result
  // the handles: the spacing arrows and the count stubs, the stubs well clear of the arrows at first
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id), ["lin:x", "cnt:x", "lin:y", "cnt:y", "lin:z", "cnt:z"]);
  const tipY = g.handles.find((h) => h.id === "lin:y")!.points[1]!;
  const stubY = g.handles.find((h) => h.id === "cnt:y")!.points[0]!;
  assert.ok(Math.hypot(...sub(stubY, tipY)) > 4, "the count arrow does not touch the spacing arrow when it first shows");
  // drag the spacing arrow along X by 10, then type in the Y bubble: two along Y
  const mid = (id: string) => { const h = gizmoOf(st)!.handles.find((q) => q.id === id)!; return scale(add(h.points[0]!, h.points[1]!), 0.5); };
  const m = mid("lin:x");
  st = drag(st, m, add(m, [10, 0, 0]));
  assert.equal(bubbles(st)[0]![1], "70");
  assert.ok(st.repeat, "a drag does not end it");
  st = reduce(st, { type: "entry", field: 2, text: "2" }, env);
  st = reduce(st, { type: "entry", field: 3, text: "50" }, env);
  assert.equal(scene(st.session).steps.length, 1, "nothing is made yet");
  // stray things do not end it: a click on nothing, Esc, Enter in a bubble
  st = reduce(st, { type: "click", x: 5, y: 5, count: 1, shift: false }, env);
  st = reduce(st, { type: "escape" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.ok(st.repeat, "still open");
  st = apply(st);
  assert.equal(st.repeat, null);
  assert.deepEqual(st.session.outcome.errors, {});
  near(st.session.outcome.kernel!.volume!, 6 * 16000, 5); // 3 x 2
  assert.equal(scene(st.session).steps.at(-1)!.type, "pattern");
  // Cancel makes nothing
  let c = select(box(), [BODY_OBJECT]);
  c = reduce(c, { type: "runAction", id: "op:linear" }, env);
  c = reduce(c, { type: "repeatCancel" }, env);
  assert.equal(c.repeat, null);
  assert.equal(scene(c.session).steps.length, 1);
});

test("a circular repeat: the pivot is a vertex joined to the middle by a line, there for Move, constraints and a length; a click on a ring sets the axis; one bubble for the count and the degrees", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "runAction", id: "op:circular" }, env);
  assert.ok(st.repeat?.pivot, "the pivot parts exist");
  const { centre, point, line } = st.repeat!.pivot!;
  const parts = scene(st.session).parts;
  assert.equal(parts[centre]!.kind, "corner");
  assert.equal(parts[point]!.kind, "corner");
  assert.equal(parts[line]!.kind, "line");
  assert.equal(frame(st).entries.length, 1, "one bubble");
  assert.deepEqual(frame(st).entries[0]!.fields.map((f) => [f.short, f.value]), [["n", "4"], ["°", "360"]]);
  assert.deepEqual(gizmoOf(st)!.handles.map((h) => h.id), ["rot:x", "rot:y", "rot:z"], "the rings only: the point is a vertex, not a ball");
  // the bubble is off to the side of the rings, not on them
  const rings = gizmoOf(st)!;
  assert.ok(Math.hypot(...sub(frame(st).entries[0]!.at!, rings.centre)) > 10);
  // a click on a ring makes it the axis (no turning needed)
  const ring = rings.handles.find((h) => h.id === "rot:x")!;
  const p = ring.points[10]!;
  const taken = hitHandle(rings, projector(st.cam, env.w, env.h).project, px(st, p)[0], px(st, p)[1])!;
  st = reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
  assert.equal(st.repeat!.op.pat[2], String("xyz".indexOf(taken.id[4]!)), "the axis of the ring that was clicked");
  // the pivot moves like any vertex: with Move; and the repeat follows it
  const before = (scene(st.session).parts[point] as { at: Vec3 }).at;
  st = select(st, [point]);
  st = reduce(st, { type: "runAction", id: "op:move" }, env);
  assert.equal(st.op!.kind, "move", "Move can be used while the repeat is open");
  assert.ok(st.repeat, "and the repeat stays");
  st = reduce({ ...st, op: { ...st.op!, axis: 0 } }, { type: "typed", key: "5", shift: false }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near((scene(st.session).parts[point] as { at: Vec3 }).at[0], before[0] + 5, 1e-6);
  // some operations are not offered meanwhile
  const ringItems = flat(reduce(st, { type: "menu", x: 100, y: 100 }, env).menu!.items);
  assert.equal(ringItems.find((i) => i.id === "op:pushpull")!.enabled, false);
  assert.equal(ringItems.find((i) => i.id === "op:move")!.enabled, true);
  assert.equal(ringItems.find((i) => i.id === "tool:rect")!.enabled, true);
  // numbers for four copies spread over 360 about the Z axis through the pivot; apply: the pivot parts go, four bodies stay
  st = reduce(st, { type: "entry", field: 0, text: "4" }, env);
  st = reduce(st, { type: "entry", field: 2, text: "2" }, env);
  st = apply({ ...st, op: null });
  assert.deepEqual(st.session.outcome.errors, {});
  near(st.session.outcome.kernel!.volume!, 4 * 16000, 5);
  assert.ok(!(point in scene(st.session).parts), "the pivot parts are taken away");
});

test("a drawn figure can be repeated too: copies of its corners, lines and relations, a rectangle stays a rectangle; in a line or round a point; Cancel takes the pivot parts away", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const faces = () => Object.values(scene(st.session).parts).filter((p) => p.kind === "face").length;
  st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.deepEqual(bubbles(st), [["3", "15"], ["1", "7.5"], ["1", "15"]], "three along the figure's own direction, spaced one and a half sizes (a flat one has no size across, so the biggest is used there)");
  st = apply(st);
  assert.equal(st.session.message, null);
  assert.equal(faces(), 3, "three rectangles");
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").length, 12);
  assert.equal(scene(st.session).relations.length, 12, "each copy keeps its four relations");
  st = { ...st, session: undoLast(st.session) };
  assert.equal(faces(), 1, "one undo takes the copies away");
  // round a point: the pivot is a vertex on the figure's plane
  st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
  st = reduce(st, { type: "runAction", id: "op:circular" }, env);
  const piv = st.repeat!.pivot!;
  assert.equal((scene(st.session).parts[piv.point] as { plane: string }).plane, XY, "on the figure's plane");
  st = reduce(st, { type: "entry", field: 0, text: "4" }, env);
  st = apply(st);
  assert.equal(st.session.message, null);
  assert.equal(faces(), 4);
  // Cancel
  st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
  const partsBefore = Object.keys(scene(st.session).parts).length;
  st = reduce(st, { type: "runAction", id: "op:circular" }, env);
  assert.ok(Object.keys(scene(st.session).parts).length > partsBefore, "the pivot parts are in the scene");
  st = reduce(st, { type: "repeatCancel" }, env);
  assert.equal(Object.keys(scene(st.session).parts).length, partsBefore, "and gone");
});

test("a right click changes nothing about the selection; several figures selected together move together; Copy makes one more beside it", () => {
  let s = createSession(kernel);
  const r1 = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r1.command);
  const r2 = drawSquaredRectangle(scene(s), XY, [30, 0, 0], [40, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r2.command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const faces = Object.values(scene(st.session).parts).filter((p) => p.kind === "face").map((p) => p.ref);
  assert.equal(faces.length, 2);
  st = select(st, faces);
  const [x, y] = px(st, [100, 100, 0]);
  const after = reduce(st, { type: "menu", x, y }, env);
  assert.deepEqual(selection(after.session), faces);
  assert.ok(after.menu);
  st = reduce(st, { type: "runAction", id: "op:move" }, env);
  assert.equal(st.op!.kind, "move");
  st = reduce({ ...st, op: { ...st.op!, axis: 0 } }, { type: "typed", key: "5", shift: false }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const xs = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at[0]);
  near(Math.min(...xs), 5, 1e-6);
  near(Math.max(...xs), 45, 1e-6);
  // Copy of one of them: a repeat of two, the same arrows and numbers
  st = select({ ...st, op: null }, [faces[0]!]);
  st = reduce(st, { type: "runAction", id: "op:copy" }, env);
  assert.equal(bubbles(st)[0]![0], "2");
  st = apply(st);
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "face").length, 3);
  // and a body
  let b = select(box(), [BODY_OBJECT]);
  b = reduce(b, { type: "runAction", id: "op:copy" }, env);
  b = apply(b);
  near(b.session.outcome.kernel!.volume!, 2 * 16000, 5);
});

test("pulling the arrow of a round face is smooth: a fine step, and an arrow seen nearly end-on does not shoot between sizes", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  const round = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.curved)!;
  for (const cam of [{ ...homeCamera(), target: [0, 0, 10] as Vec3, distance: 80 }, { ...homeCamera(), azimuth: 0.15, elevation: 0.1, target: [0, 0, 10] as Vec3, distance: 80 }]) {
    let st = select({ ...createState(s), cam }, [round.ref]);
    const h = frame(st).gizmo!.handles[0]!;
    const [a, b] = [px(st, h.points[0]!), px(st, h.points[1]!)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    st = reduce(st, { type: "hover", x, y }, env);
    let last = 0;
    let biggest = 0;
    for (let k = 0; k < 10; k++) {
      x += u[0]! * 3;
      y += u[1]! * 3;
      st = reduce(st, { type: "orbit", dx: u[0]! * 3, dy: u[1]! * 3, x, y }, env);
      const v = st.op!.value!;
      biggest = Math.max(biggest, Math.abs(v - last));
      last = v;
    }
    assert.ok(biggest <= 0.75, `3 px of the pointer changes the radius by at most 0.75 mm (it was ${biggest})`);
    assert.ok(Math.abs(Math.round(last * 50) - last * 50) < 1e-6, "in steps of 0.02");
  }
});

test("fillet / chamfer on the rim of a cylinder: the arrow stands on the rim, in the middle of the curve, and points out across it", async () => {
  const { readFileSync } = await import("node:fs");
  const { openSession, undoLast } = await import("../src/interaction/session.ts");
  const opened = openSession(kernel, readFileSync(new URL("./fixtures/cyl-fillet.cad.json", import.meta.url), "utf8"));
  assert.ok(opened.ok);
  const s = undoLast((opened as { ok: true; value: ReturnType<typeof createSession> }).value); // before the fillet
  const top = Object.values(scene(s).parts).find((p) => p.kind === "line" && p.origin === "body" && (scene(s).parts[p.a] as { at: Vec3 }).at[2] > 4)!;
  let st = select({ ...createState(s), cam: homeCamera() }, [top.ref]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  const h = gizmoOf(st)!.handles[0]!;
  const mid = scale(add(h.points[0]!, h.points[1]!), 0.5);
  near(Math.hypot(mid[0] - 11.93, mid[1] - 13.83), 9.060971, 1e-3); // on the rim, not inside the face
  near(mid[2], 4.2, 1e-3);
  const d = sub(h.points[1]!, h.points[0]!);
  assert.ok(d[2] > 0 && Math.hypot(d[0] - 0, d[1]) > 0, "out and up");
});

test("while the arrow of a round face is dragged, the size the pointer is at shows at once as rings (the body catches up); a small post is meshed finely", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 2);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 10 } } });
  const tris = (s.outcome.kernel!.mesh!.triangles.length) / 3;
  assert.ok(tris >= 150, `a 4 mm wide post has many facets (${tris} triangles)`);
  const round = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.curved)!;
  let st = select({ ...createState(s), cam: homeCamera() }, [round.ref]);
  assert.equal(frame(st).preview, null, "nothing extra when not dragging");
  const h = frame(st).gizmo!.handles[0]!;
  const [a, b] = [px(st, h.points[0]!), px(st, h.points[1]!)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  st = reduce(st, { type: "hover", x, y }, env);
  st = reduce(st, { type: "orbit", dx: ((b[0] - a[0]) / len) * 8, dy: ((b[1] - a[1]) / len) * 8, x: x + ((b[0] - a[0]) / len) * 8, y: y + ((b[1] - a[1]) / len) * 8 }, env);
  const f = frame(st);
  assert.ok(f.preview && f.preview.segments.length > 100, "rings and lines for the size now");
  const radii = f.preview!.segments.slice(0, 64).map(([p]) => Math.hypot(p[0], p[1]));
  near(radii[0]!, 2 + st.op!.value!, 1e-6);
});
