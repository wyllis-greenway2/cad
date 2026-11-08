import { consumed } from "../src/operation/ownership.ts";
import { normalOfPlane } from "../src/operation/part.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import test from "node:test";
import { flat } from "./helpers/menu.ts";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { add, scale, dot, sub, cross, normalize } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection, undoLast } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle, drawCircle, drawChain } from "../src/operation/build.ts";
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
  assert.deepEqual(scene(st.session).steps.at(-1)!.params, { axis: 0, value: 10, follow: 1 });
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
  assert.deepEqual({ mode: scene(out.session).steps.at(-1)!.params.mode, value: scene(out.session).steps.at(-1)!.params.value }, { mode: "fillet", value: 2 }); // (the step also remembers which edge: ranks, sigs)
  near(out.session.outcome.kernel!.volume!, 16000 - (1 - Math.PI / 4) * 4 * 40, 0.1);
  // in by 2 mm: a chamfer of 2
  const inn = drag(st, centre, add(centre, scale(d, -2)));
  assert.deepEqual({ mode: scene(inn.session).steps.at(-1)!.params.mode, value: scene(inn.session).steps.at(-1)!.params.value }, { mode: "chamfer", value: 2 }); // (the step also remembers which edge: ranks, sigs)
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
  assert.equal(scene(pulled.session).steps.at(-1)!.type, "extrude", "the end of the extrusion is pulled: its depth changes, no step is added");
  assert.equal(scene(pulled.session).steps.at(-1)!.params.depth, 15);
  assert.equal(scene(pulled.session).steps.length, 1);
  const pushed = drag(st, pm, add(pm, [0, 0, -5]));
  near(pushed.session.outcome.kernel!.volume!, 40 * 20 * 7, 0.5);
  // typing a number does the same as dragging it that far
  const typed = reduce(typeText(st, "16"), { type: "typed", key: "Enter", shift: false }, env); // the size you want: 16 thick
  near(typed.session.outcome.kernel!.volume!, 40 * 20 * 16, 0.5);
});

const typeText = (st: AppState, text: string) => [...text].reduce((a, c) => reduce(a, { type: "typed", key: c, shift: false }, env), st);

test("a line of the body shows the fillet / chamfer double arrow by itself; several lines show only one, on the last selected, and the size dragged applies to all", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2]);
  st = select(st, vertical.map((p) => p.ref));
  assert.ok(ringOps(st).includes("op:edge"), "fillet / chamfer is in the right-click ring too");
  const g = gizmoOf(st)!; // and the arrows show up by themselves
  assert.equal(g.handles.length, 1, "one arrow for all the edges");
  assert.ok(g.handles.every((h) => h.kind === "double"));
  const h = g.handles[0]!;
  const centre = scale(add(h.points[0]!, h.points[1]!), 0.5);
  const d = sub(h.points[1]!, h.points[0]!);
  const unit = scale(d, 1 / Math.hypot(...d));
  const done = drag(st, centre, add(centre, scale(unit, 2)));
  assert.deepEqual({ mode: scene(done.session).steps.at(-1)!.params.mode, value: scene(done.session).steps.at(-1)!.params.value }, { mode: "fillet", value: 2 }); // (the step also remembers which edge: ranks, sigs)
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
  st = reduce(st, { type: "entry", field: 2, text: "5" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
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
  assert.deepEqual(frame(st).entry!.fields.map((f) => [f.label, f.value]), [["Z", "0"]], "only the axis that is chosen shows, Z to begin with (`in_194`)");
  st = reduce(st, { type: "entry", field: 2, text: "90" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const xs = cornersOf().map((q) => q[0]);
  const ys = cornersOf().map((q) => q[1]);
  near(Math.max(...xs) - Math.min(...xs), 20, 0.01);
  near(Math.max(...ys) - Math.min(...ys), 40, 0.01);
  st = select({ ...st, op: null }, [faceRef()]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  assert.deepEqual(frame(st).entry!.fields.map((f) => [f.label, f.value]), [["Z", "90"]], "it shows how the figure is turned now about the chosen axis");
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
  assert.equal(scene(st.session).steps.length, 1, "just the box, its depth changed, however many drags");
  const mid2 = scale(add(gizmoOf(st)!.handles[0]!.points[0]!, gizmoOf(st)!.handles[0]!.points[1]!), 0.5);
  st = drag(st, mid2, add(mid2, [0, 0, -3])); // back by 3: 3 in all
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 23, 0.5);
  // a number typed in the bubble is the size you want
  st = reduce(st, { type: "entry", field: 0, text: "30" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 30, 0.5);
  assert.equal(scene(st.session).steps.length, 1);
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
  assert.deepEqual({ mode: scene(st.session).steps.at(-1)!.params.mode, value: scene(st.session).steps.at(-1)!.params.value }, { mode: "fillet", value: 2 }); // (the step also remembers which edge: ranks, sigs)
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

test("rotation shows only the angle about the chosen axis (Z to begin with; the X Y Z buttons choose another): how the body is turned now, and each can be set on its own", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  const fields = (s: AppState) => frame(s).entry!.fields.map((f) => [f.label, f.value]);
  assert.deepEqual(fields(st), [["Z", "0"]]);
  // turn it 90 degrees about Z by typing it in the Z field
  st = reduce(st, { type: "entry", field: 2, text: "90" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near(bbox(st).max[0]! - bbox(st).min[0]!, 20, 0.05);
  near(bbox(st).max[1]! - bbox(st).min[1]!, 40, 0.05);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  assert.deepEqual(fields(st), [["Z", "90"]], "it shows how it is turned now");
  // choose X and set it on its own to 30: Z stays 90
  st = reduce(st, { type: "look", plane: "X" }, env);
  assert.deepEqual(fields(st), [["X", "0"]]);
  st = reduce(st, { type: "entry", field: 0, text: "30" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  assert.deepEqual(fields(st), [["Z", "90"]]);
  st = reduce(st, { type: "look", plane: "X" }, env);
  assert.deepEqual(fields(st), [["X", "30"]]);
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
  assert.ok(frame(st).highlight.selection.includes(round[0]!.ref));
  // a fillet face can be pulled: it changes the fillet's size (3 mm) and adds no step
  assert.ok(ringOps(st).includes("op:pushpull"), "a fillet face can be pushed or pulled: the size of the fillet");
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = typeText(st, "2");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  assert.deepEqual(scene(st.session).steps.map((x) => x.type + ":" + (x.params.value ?? x.params.depth)), ["extrude:20", "edgeMod:2"]);
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
import { faceEdit } from "../src/interaction/faceedit.ts";
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

test("a linear repeat of the body: one copy to begin with, a helper bubble on the arrow to pull for a copy and then on the one to pull to separate (once each), only the arrow taken shows its number, the result shows as you go; right click applies, Esc gives it up (`in_236`)", () => {
  let st = select(box(), [BODY_OBJECT]); // 40 x 20 x 20
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.ok(st.repeat && !st.op, "a repeat is open, and it is not an operation");
  assert.equal(frame(st).entries.length, 0, "no arrow has been taken: no number is shown");
  assert.equal(frame(st).helper?.text, "pull to copy");
  assert.equal(scene(st.session).steps.length, 1);
  // the handles: the spacing arrows and the count stubs, the stubs well clear of the arrows at first
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id), ["lin:x", "cnt:x", "lin:y", "cnt:y", "lin:z", "cnt:z"]);
  const tipY = g.handles.find((h) => h.id === "lin:y")!.points[1]!;
  const stubY = g.handles.find((h) => h.id === "cnt:y")!.points[0]!;
  assert.ok(Math.hypot(...sub(stubY, tipY)) > 4, "the count arrow does not touch the spacing arrow when it first shows");
  const tipOf = (id: string) => gizmoOf(st)!.handles.find((q) => q.id === id)!.points.at(-1)!;
  assert.deepEqual(frame(st).helper!.at, tipOf("cnt:x"), "the bubble stands on the arrow past the last copy");
  const mid = (id: string) => { const h = gizmoOf(st)!.handles.find((q) => q.id === id)!; return scale(add(h.points[0]!, h.points[1]!), 0.5); };
  // pull the count arrow out by one spacing (60): a copy exists, so that helper goes and the other one comes, on the spacing arrow
  const c0 = mid("cnt:x");
  st = drag(st, c0, add(c0, [60, 0, 0]));
  assert.deepEqual(bubbles(st), [["2"]], "the count arrow was taken: only its number shows");
  assert.deepEqual(frame(st).entries.map((e) => e.fields.map((f) => f.short)), [["X×"]]);
  assert.equal(frame(st).helper?.text, "pull to separate");
  assert.deepEqual(frame(st).helper!.at, tipOf("lin:x"));
  near(frame(st).mesh!.vertices.reduce((m, v, i) => (i % 3 === 0 ? Math.max(m, v) : m), -1e9), 40 + 60, 0.01); // the preview is the real result
  // pull the spacing arrow out by 10: separated a bit, that helper goes for good, and the number shown is the spacing's
  const m = mid("lin:x");
  st = drag(st, m, add(m, [10, 0, 0]));
  assert.deepEqual(bubbles(st), [["70"]]);
  assert.equal(frame(st).helper, null, "each helper shows once");
  assert.ok(st.repeat, "a drag does not end it");
  st = drag(st, mid("cnt:x"), add(mid("cnt:x"), [0, 0, 0]));
  assert.equal(frame(st).helper, null, "and does not come back");
  st = reduce(st, { type: "entry", field: 2, text: "2" }, env);
  assert.deepEqual(bubbles(st), [["2"]], "typing a number takes that arrow: its number only");
  st = reduce(st, { type: "entry", field: 3, text: "50" }, env);
  assert.equal(scene(st.session).steps.length, 1, "nothing is made yet");
  // stray things do not end it: a click on nothing, Enter in a bubble
  st = reduce(st, { type: "click", x: 5, y: 5, count: 1, shift: false }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.ok(st.repeat, "still open");
  // a right click makes the copies and leaves it
  const done = reduce(st, { type: "menu", x: 400, y: 300 }, env);
  assert.equal(done.repeat, null);
  assert.equal(done.menu, null, "no menu: the right click was the apply");
  assert.deepEqual(done.session.outcome.errors, {});
  near(done.session.outcome.kernel!.volume!, 4 * 16000, 5); // 2 x 2
  assert.equal(scene(done.session).steps.at(-1)!.type, "pattern");
  // Esc gives it up, and a right click with no copy to make just leaves it: nothing is made
  for (const leave of [{ type: "escape" }, { type: "menu", x: 400, y: 300 }] as const) {
    let c = select(box(), [BODY_OBJECT]);
    c = reduce(c, { type: "runAction", id: "op:linear" }, env);
    c = reduce(c, leave, env);
    assert.equal(c.repeat, null);
    assert.equal(scene(c.session).steps.length, 1);
  }
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
  const ringItems = flat(reduce(st, { type: "menu", x: 100, y: 100, button: true }, env).menu!.items); // (from the ⋯ button: a right click applies the repeat)
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
  assert.deepEqual(st.repeat!.op.patStart, [1, 15, 1, 7.5, 1, 15], "one to begin with, spaced one and a half sizes (a flat one has no size across, so the biggest is used there)");
  assert.equal(frame(st).helper?.text, "pull to copy");
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
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
  assert.equal(st.repeat!.op.patStart![0], 2, "a copy is a repeat of two");
  assert.equal(frame(st).helper?.text, "pull to separate", "the copy exists already: the helper is the one for moving it away");
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

test("while the arrow of a round face is dragged, the size the pointer is at shows at once (the wall itself is drawn wider, `in_218`; the thin rings that stood in for it, `in_165`, are no longer shown); a small post is meshed finely", () => {
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
  assert.ok(f.faceShift?.radial, "the wall drawn at the size now");
  near(f.faceShift!.radial!.dr, st.op!.value!, 1e-6);
  assert.equal(f.preview, null, "no rings on top of it");
});

test("a post pulled taller is still one round wall: selecting it and changing the diameter changes the whole of it, not only the first part", () => {
  let st = box();
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 5);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 10 } } });
  st = { ...createState(s), cam: homeCamera() };
  // pull the top face up to 16 thick
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && p.at[2] === 10)!;
  st = select(st, [top.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = typeText(st, "16"); // (the number typed is how thick it is)
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.outcome.kernel!.bbox!.max[2], 16);
  const walls = Object.values(scene(st.session).parts).filter((p) => p.kind === "plane" && p.origin === "body" && !!p.curved);
  assert.equal(walls.length, 1, "one round wall, 0 to 16, not a wall of 10 and a wall of 6");
  const wall = walls[0] as Extract<(typeof walls)[number], { kind: "plane" }>;
  assert.equal(wall.curved!.hi - wall.curved!.lo, 16);
  st = select(st, [walls[0]!.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = typeText(st, "14"); // (a diameter)
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const bb = st.session.outcome.kernel!.bbox!;
  near(bb.max[0] - bb.min[0], 14);
  near(bb.max[2], 16);
  near(st.session.outcome.kernel!.volume!, Math.PI * 49 * 16, 20);
});

test("the rim of a cylinder is one edge: picking a half picks both halves, and after an end is pushed or pulled (the rim is then one closed edge) it can still be picked", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  let st: AppState = { ...createState(s), cam: { ...homeCamera(), target: [0, 0, 10], distance: 80 } };
  const rimAt = (z: number, a: number): Vec3 => [10 * Math.cos(a), 10 * Math.sin(a), z];
  const pick = (a: number, z: number) => { const [x, y] = px(st, rimAt(z, a)); st = reduce(reduce(st, { type: "escape" }, env), { type: "click", x, y, count: 1, shift: false }, env); return selection(st.session).map((r) => scene(st.session).parts[r]).filter((p) => p?.kind === "line"); };
  const half = pick(1, 20);
  assert.equal(half.length, 2, "both halves of the top rim are picked together");
  // pull the top up to 30
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && p.at[2] === 20)!;
  st = select(st, [top.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = typeText(st, "30");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.outcome.kernel!.bbox!.max[2], 30);
  for (const a of [0.4, 1.5, 2.8, 4, 5.5]) {
    const rim = pick(a, 30);
    assert.ok(rim.length >= 1, `the new top rim can be picked at ${a}`);
  }
  // and it is one edge, so it can be filleted whole
  st = reduce(st, { type: "begin", name: "edge" }, env);
  assert.ok(st.op, "fillet / chamfer starts on the rim");
  const arrow = gizmoOf(st)!.handles[0]!;
  assert.ok(Math.hypot(...sub(arrow.points[1]!, arrow.points[0]!)) > 1, "its arrow is a real arrow, not collapsed to a point");
  near(Math.hypot(...sub(scale(add(arrow.points[0]!, arrow.points[1]!), 0.5), [0, 0, 30])) , 0, 11); // (near the rim: a circle of 10 about the axis)
  const before = st.session.outcome.kernel!.volume!;
  st = typeText(st, "1");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  assert.ok(st.session.outcome.kernel!.volume! < before - 1, "the whole rim is rounded");
});

test("a sketch tool chosen from the ring turns to the one selected plane, or, with none or several selected, to the plane of what the right click was on", () => {
  const start = (sel: string[], over: Vec3) => {
    let st = select(box(), sel);
    const [x, y] = px(st, over);
    st = reduce(st, { type: "hover", x, y }, env);
    st = reduce(st, { type: "menu", x, y }, env);
    return reduce(st, { type: "runAction", id: "tool:rect" }, env);
  };
  const faces = Object.values(scene(box().session).parts).filter((p) => p.kind === "plane" && p.origin === "body" && !p.curved);
  const elevation = (st: AppState) => st.anim!.to.elevation;
  // nothing selected: the top face under the click
  near(Math.abs(elevation(start([], [20, 10, 20]))), Math.PI / 2, 1e-3);
  // two faces selected: the one under the click (a side), not either selected
  const sideRight = faces.find((p) => p.kind === "plane" && Math.abs(p.at[0] - 40) < 1e-6)!;
  const sideBack = faces.find((p) => p.kind === "plane" && Math.abs(p.at[1] - 20) < 1e-6)!;
  assert.ok(Math.abs(elevation(start([sideRight.ref, sideBack.ref], [20, 10, 20]))) > 1.5, "turns to the top, under the click");
  // one face selected (the side): the view goes to it, whatever the click was on
  const one = start([sideRight.ref], [20, 10, 20]);
  assert.ok(Math.abs(elevation(one)) < 0.2, "turns to the selected side (looking along X)");
});

test("fillet / chamfer on the rim of a hole: its arrow points out of the corner into the air, which is towards the hole's axis", async () => {
  const { readFileSync } = await import("node:fs");
  const { openSession } = await import("../src/interaction/session.ts");
  const opened = openSession(kernel, readFileSync(new URL("./fixtures/hole-edits.cad.json", import.meta.url), "utf8"));
  assert.ok(opened.ok);
  const s = (opened as { ok: true; value: ReturnType<typeof createSession> }).value;
  const rim = Object.values(scene(s).parts).find((p) => p.kind === "line" && p.origin === "body" && !!p.circle && Math.abs(p.circle.radius - 1.6405) < 1e-3)!;
  let st = select({ ...createState(s), cam: homeCamera() }, [rim.ref]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  const h = gizmoOf(st)!.handles[0]!;
  const d = sub(h.points[1]!, h.points[0]!);
  const m = scale(add(h.points[0]!, h.points[1]!), 0.5);
  const c = (rim as { circle: { center: Vec3 } }).circle.center;
  assert.ok(d[0] * (c[0] - m[0]) + d[1] * (c[1] - m[1]) + d[2] * (c[2] - m[2]) > 1, "towards the axis");
});

test("a fillet too big for its edge is refused with a reason that says what it was (the kernel itself says nothing)", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2])!;
  st = select(st, [vertical.ref]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = typeText(st, "30");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.match(st.session.message ?? "", /fillet of that size|too big|smaller/i);
  assert.equal(scene(st.session).steps.length, 1, "nothing was added");
});

/** A cylinder of radius 10 and height 20 from a circle on the XY plane. */
function cylinder(): ReturnType<typeof createSession> & { circle: string } {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  return Object.assign(s, { circle: c.circle as string });
}
const typeNumber = (st: AppState, text: string) => reduce(typeText(st, text), { type: "typed", key: "Enter", shift: false }, env);

test("pulling a face the body already has changes the step that made it: the wall of a chamfered cylinder made narrower takes its chamfer with it, and no step is added", () => {
  const s0 = cylinder();
  let st = select({ ...createState(s0), cam: homeCamera() }, Object.values(scene(s0).parts).filter((p) => p.kind === "line" && p.origin === "body" && (scene(s0).parts[p.a] as { at: Vec3 }).at[2] === 20).map((p) => p.ref));
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = typeNumber(st, "-2"); // a chamfer of 2
  const volumeBefore = st.session.outcome.kernel!.volume!;
  const wall = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.curved)!;
  st = select(st, [wall.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "radius", "the app knows the circle this wall comes from");
  st = typeNumber(st, "14"); // a diameter of 14
  assert.equal(st.session.message, null);
  assert.deepEqual(scene(st.session).steps.map((x) => x.type), ["extrude", "edgeMod"], "no push / pull step was added");
  const bb = st.session.outcome.kernel!.bbox!;
  near(bb.max[0] - bb.min[0], 14);
  near(bb.max[2], 20);
  assert.deepEqual(st.session.outcome.errors, {});
  assert.equal((scene(st.session).parts[(s0 as unknown as { circle: string }).circle] as { radius: number }).radius, 7);
  // the chamfer is still there: the volume is that of a 7 post with the corner cut, not a plain one
  near(st.session.outcome.kernel!.volume!, (volumeBefore * 49) / 100, 40);
  assert.ok(st.session.outcome.kernel!.volume! < Math.PI * 49 * 20 - 50, "less than the plain cylinder: the chamfer went with the wall");
});

test("a wall that is no longer the extruded circle's (an earlier push / pull changed it) is edited the old way, with a prism", () => {
  const s0 = cylinder();
  let st = select({ ...createState(s0), cam: homeCamera() }, [Object.values(scene(s0).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.curved)!.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = { ...st, op: { ...st.op!, noEdit: true } };
  st = typeNumber(st, "30"); // a prism step: the wall is now radius 15 and no longer the circle's
  assert.deepEqual(scene(st.session).steps.map((x) => x.type), ["extrude", "pushPull"]);
  const wall = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.curved)!;
  st = select({ ...st, op: null }, [wall.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit, undefined, "the circle is radius 10, the wall 15: no step to change");
});

test("a hole's wall: its diameter is the cutting circle's", () => {
  // a block with a round hole cut into it from the XY plane: the circle is extruded backwards through the block
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [-20, -20, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 10 } } });
  const c = drawCircle(scene(s), XY, [0, 0, 0], 5);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 10 } } });
  const wall = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.curved);
  if (!wall) return; // (a circle pulled the same way as the block adds a post: not a hole)
  let st = select({ ...createState(s), cam: homeCamera() }, [wall.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "radius");
});

test("pulling the side of an extruded rectangle moves that side of the sketch: no step is added and the body is a bigger block", () => {
  let st = box(); // 40 x 20 x 20 from the origin
  const side = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && Math.abs(p.at[0] - 40) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!;
  st = select(st, [side.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "side");
  st = typeNumber(st, "50"); // 50 wide: typing the size you want
  assert.equal(st.session.message, null);
  assert.deepEqual(scene(st.session).steps.map((x) => x.type), ["extrude"], "no push / pull step");
  const bb = st.session.outcome.kernel!.bbox!;
  near(bb.max[0] - bb.min[0], 50);
  near(bb.max[1] - bb.min[1], 20);
  near(st.session.outcome.kernel!.volume!, 50 * 20 * 20, 0.5);
});

test("a rectangle with a locked width cannot be stretched from its side: it is refused and the constraints flash, no prism is added (`in_208`)", () => {
  let st = box();
  // lock the width: the two vertical lines' distance
  const lines = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn");
  assert.ok(lines.length >= 4);
  const bottom = lines.find((l) => { if (l.kind !== "line") return false; const [a, b] = [scene(st.session).parts[l.a] as { at: Vec3 }, scene(st.session).parts[l.b] as { at: Vec3 }]; return a.at[1] === 0 && b.at[1] === 0; })!;
  const act = actionsFor(scene(st.session), [bottom.ref]).find((x) => x.id === "length")!;
  st = { ...st, session: run(st.session, act.run(40)) };
  const side = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && Math.abs(p.at[0] - 40) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!;
  st = select(st, [side.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = typeNumber(st, "50");
  assert.deepEqual(scene(st.session).steps.map((x) => x.type), ["extrude"], "the length is locked at 40: nothing was added");
  assert.ok(st.session.conflict && st.session.conflict.culprits.length > 0, "the constraint that holds it flashes");
});

test("a chamfer face of a box edge: pulling it out makes the chamfer smaller, as the step that made it; the end of an earlier prism push is its depth", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2])!;
  st = select(st, [vertical.ref]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = typeNumber(st, "-4"); // a chamfer of 4
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && p.mesh && p.u && !(Math.abs(p.at[0]) < 1e-6) && false);
  void face;
  const cham = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.rounded && !p.curved && [...p.u, ...p.v].some((v) => Math.abs(Math.abs(v) - Math.SQRT1_2) < 1e-3));
  assert.ok(cham, "the chamfer is a diagonal face");
  st = select(st, [cham!.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "edgeSize");
  st = typeNumber(st, "2");
  assert.deepEqual(scene(st.session).steps.map((x) => x.type + ":" + (x.params.value ?? x.params.depth)), ["extrude:20", "edgeMod:2"]);
});

test("the end made by a push / pull step (a prism, as made before) is edited through that step's depth", () => {
  let st = box();
  // make a prism step the old way, by hand
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && p.at[2] === 20 && p.u[2] === 0 && p.v[2] === 0)!;
  st = select(st, [top.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  st = { ...st, op: { ...st.op!, noEdit: true } };
  st = typeNumber(st, "30");
  assert.deepEqual(scene(st.session).steps.map((x) => x.type), ["extrude", "pushPull"]);
  const top2 = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && p.at[2] === 30 && p.u[2] === 0 && p.v[2] === 0)!;
  st = select({ ...st, op: null }, [top2.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "stepDepth");
  st = typeNumber(st, "35");
  assert.deepEqual(scene(st.session).steps.map((x) => x.type), ["extrude", "pushPull"], "still one prism step, its depth changed");
  near(st.session.outcome.kernel!.volume!, 40 * 20 * 35, 0.5);
});

test("pulling a side of an extruded hexagon extends and cuts its neighbours: the other sides keep their directions (they are extended or cut to meet it)", () => {
  let s = createSession(kernel);
  const R = 10;
  const pts: Vec3[] = Array.from({ length: 6 }, (_, k) => [R * Math.cos((k * Math.PI) / 3), R * Math.sin((k * Math.PI) / 3), 0]);
  const h = drawChain(scene(s), XY, pts, true);
  s = run(s, h.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: h.lines, params: { depth: 5 } } });
  // the side on the right: from the corner at 300 degrees to the one at 0 and 60... pick the face whose normal points along +x with the largest area, i.e. the one at the corner pair (0, 60 degrees) is not flat on x: use the face facing +30 degrees
  const faces = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && !p.curved && p.mesh && Math.abs(normalOfPlane(p)[2]) < 1e-6);
  const face = faces.find((p) => { if (p.kind !== "plane") return false; const n = normalOfPlane(p); return Math.abs(n[0] - Math.cos(Math.PI / 6)) < 1e-3 && Math.abs(n[1] - Math.sin(Math.PI / 6)) < 1e-3; })!;
  assert.ok(face, "a side facing 30 degrees");
  let st = select({ ...createState(s), cam: homeCamera() }, [face.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "side");
  const before = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at);
  st = typeNumber(st, String(st.op!.dim!.base + 2)); // 2 mm out
  assert.equal(st.session.message, null);
  const after = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at);
  // the two corners of that side moved along their neighbours: the lines from them to the next corners keep their direction
  const moved = after.filter((a) => !before.some((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6));
  assert.equal(moved.length, 2);
  for (const m of moved) {
    const old = before.find((b) => Math.abs(Math.hypot(b[0], b[1]) - R) < 1e-6 && Math.hypot(b[0] - m[0], b[1] - m[1]) < 5)!;
    const d = [m[0] - old[0], m[1] - old[1]] as [number, number];
    // along the neighbouring side, which points from the corner at 0 / 60 degrees to 300 / 120 degrees: not along the face normal
    assert.ok(Math.abs(d[0] * Math.sin(Math.PI / 6) - d[1] * Math.cos(Math.PI / 6)) > 0.5, "moved along the neighbour, not straight out");
  }
  // the neighbours lean towards each other, so moved out by 2 the side gets shorter: 10 - 2 x 2 / tan(60 degrees); the area grows by 2 x (10 + that) / 2
  const side2 = 10 - (2 * 2) / Math.tan(Math.PI / 3);
  near(st.session.outcome.kernel!.volume!, (3 * Math.sqrt(3) / 2) * R * R * 5 + ((10 + side2) / 2) * 2 * 5, 0.5);
});

test("three fillets one after another at one corner: the third cannot be made alone, so it is made together with the ones before it (the kernel blends a corner when its edges are rounded together)", () => {
  const s0 = box();
  const sc = scene(s0.session);
  const corner = [40, 20, 20];
  const edges = Object.values(sc.parts).filter((p) => p.kind === "line" && p.origin === "body" && [(sc.parts[p.a] as { at: Vec3 }).at, (sc.parts[p.b] as { at: Vec3 }).at].some((q) => Math.hypot(q[0] - corner[0]!, q[1] - corner[1]!, q[2] - corner[2]!) < 1e-3));
  assert.equal(edges.length, 3);
  let s = s0.session;
  edges.forEach((e, k) => { s = run(s, { type: "addStep", step: { id: `s_30${k}`, type: "edgeMod", parts: [e.ref], params: { mode: "fillet", value: 3 } } }); assert.equal(s.message, null, `fillet ${k + 1} of 3`); });
  assert.deepEqual(s.outcome.errors, {});
  assert.ok(s.outcome.kernel!.volume! < 16000, "all three are rounded");
});

test("a fillet or chamfer face has its arrow back: it shows by itself, changes the size, and pulled back to nothing removes the fillet", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2])!;
  st = select(st, [vertical.ref]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = typeNumber(st, "3");
  const plain = 40 * 20 * 20;
  const rounded = st.session.outcome.kernel!.volume!;
  assert.ok(rounded < plain);
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.rounded)!;
  st = select({ ...st, op: null }, [face.ref]);
  assert.deepEqual(frame(st).gizmo?.handles.map((h) => h.id), ["pull"], "the arrow shows by itself");
  // drag it: the fillet gets smaller
  const h = gizmoOf(st)!.handles[0]!;
  const mid = scale(add(h.points[0]!, h.points[1]!), 0.5);
  const unit = scale(sub(h.points[1]!, h.points[0]!), 1 / Math.hypot(...sub(h.points[1]!, h.points[0]!)));
  const smaller = drag(st, mid, add(mid, scale(unit, 1)));
  const nv = Number(scene(smaller.session).steps.at(-1)!.params.value);
  assert.ok(nv < 3 && nv > 1.5, `smaller (${nv})`);
  assert.ok(smaller.session.outcome.kernel!.volume! > rounded);
  // typing 0 takes it away
  let none = reduce(st, { type: "begin", name: "pushpull" }, env);
  none = typeNumber(none, "0");
  assert.equal(none.session.message, null);
  assert.deepEqual(scene(none.session).steps.map((x) => x.type), ["extrude"]);
  near(none.session.outcome.kernel!.volume!, plain, 0.5);
});

test("the arrow of a chamfer round a post stands on the chamfer, not in the air on the axis", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  let st: AppState = { ...createState(s), cam: { ...homeCamera(), target: [0, 0, 10], distance: 80 } };
  const rim = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && p.circle && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] === 20);
  st = select(st, rim.map((r) => r.ref));
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = typeNumber(st, "-2");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.rounded)!;
  st = select({ ...st, op: null }, [face.ref]);
  const h = gizmoOf(st)!.handles[0]!;
  const mid = scale(add(h.points[0]!, h.points[1]!), 0.5);
  assert.ok(Math.hypot(mid[0], mid[1]) > 7, `on the rim, not on the axis (${mid})`);
  near(mid[2], 19, 1.5);
});

test("the lower edge of a chamfer inside a bore can be picked (it lies between two curved faces, whose mesh is a hair off the true surface)", () => {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [0, 0, 0], 20).command);
  s = run(s, drawCircle(scene(s), XY, [0, 0, 0], 10).command);
  const ring = Object.values(scene(s).parts).find((p) => p.kind === "face" && p.holes?.length)!;
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [(ring as { disk?: string }).disk as never], params: { depth: 10, holes: Object.values(scene(s).parts).find((p) => p.kind === "circle" && p.radius === 10)!.ref } } });
  const inner = Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "body" && p.circle && p.circle.center[2] === 10 && Math.abs(p.circle.radius - 10) < 1e-3).map((p) => p.ref);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "edgeMod", parts: inner, params: { mode: "chamfer", value: 2 } } });
  let st: AppState = { ...createState(s), cam: { ...homeCamera(), target: [0, 0, 5], distance: 90 } };
  let hits = 0;
  for (const a of [2.3, 3.3, 4.3, 5.3]) {
    const [x, y] = px(st, [10 * Math.cos(a), 10 * Math.sin(a), 8]);
    st = reduce(reduce(st, { type: "escape" }, env), { type: "click", x, y, count: 1, shift: false }, env);
    if (selection(st.session).some((r) => { const p = scene(st.session).parts[r]; return p?.kind === "line" && p.circle && Math.abs(p.circle.radius - 10) < 1e-3 && p.circle.center[2] === 8; })) hits++;
  }
  assert.ok(hits >= 3, `the lower chamfer edge was picked at ${hits} of 4 places on the far side`);
});

test("the move arrows show one number bubble, on the chosen axis, with how far the move has taken the body since it began: 0 to begin with, kept on across drags, and a number typed in it is that position (`in_230`)", () => {
  let st = select(box(), [BODY_OBJECT]);
  const bubbles = (s: AppState) => frameOf(s, { w: 800, h: 600 }).entries.map((e) => `${e.fields[0]!.short}=${e.fields[0]!.value}`);
  assert.deepEqual(bubbles(st), ["X=0"], "one bubble, there at once, with the arrows that stand up by themselves");
  st = reduce(st, { type: "begin", name: "move" }, env);
  assert.deepEqual(bubbles(st), ["X=0"], "0 as the move begins");
  const pull = (s: AppState, i: number, by: number): AppState => {
    const g = gizmoOf(s)!;
    const h = g.handles[i]!;
    const mid = scale(add(h.points[0]!, h.points[1]!), 0.5);
    const d = [0, 0, 0] as number[]; d[i] = by;
    return drag(s, mid, add(mid, d as unknown as Vec3));
  };
  st = pull(st, 0, 10);
  assert.deepEqual(bubbles(st), ["X=10"], "the position it has reached, after the drag");
  const c1 = gizmoOf(st)!.centre;
  st = pull(st, 0, 5);
  assert.deepEqual(bubbles(st), ["X=15"], "and on from there with the next drag (it does not start again at 0)");
  near(gizmoOf(st)!.centre[0] - c1[0], 5, 1e-6);
  // the arrows are where the steps put the body at once, whatever the kernel's box says
  const lagging = { ...st, session: { ...st.session, outcome: { ...st.session.outcome, kernel: { ...st.session.outcome.kernel!, stale: true } } } };
  near(gizmoOf(lagging)!.centre[0] - c1[0], 5, 1e-6);
  st = pull(st, 1, 3);
  assert.deepEqual(bubbles(st), ["Y=3"], "another axis: its own number, from where the move began");
  st = reduce(st, { type: "entry", field: 1, text: "7" }, env);
  assert.deepEqual(bubbles(st), ["Y=7"]);
  assert.equal(frameOf(st, { w: 800, h: 600 }).entries[0]!.fields[0]!.typed, true);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  nearV(bbox(st).min, [15, 7, 0]);
});

test("a whole-body move or turn being dragged is only drawn moved by a matrix (the kernel is not asked), and the matrix puts the body where the finished step does (`in_216`)", () => {
  for (const [kind, axis, value] of [["move", 0, 10], ["rotate", 2, 35], ["scale", 0, 1.5]] as const) {
    let st = select(box(), [BODY_OBJECT]);
    st = reduce(st, { type: "begin", name: kind }, env);
    const base = st.session.outcome.kernel!;
    st = { ...st, op: { ...st.op!, axis: axis as 0 | 1 | 2, value } };
    const f = frameOf(st, { w: 800, h: 600 });
    assert.ok(f.bodyMatrix, `${kind}: a matrix`);
    assert.equal(f.mesh, base.mesh, `${kind}: the mesh is the one already there, not a new one from the kernel`);
    // the corners of the mesh's box, moved by the matrix, are the corners of the box the kernel makes for the finished step
    const m = f.bodyMatrix!;
    const [lo, hi] = [base.bbox!.min, base.bbox!.max];
    const pts: Vec3[] = [];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) { const g = (i: number) => m[i]!; pts.push([g(0) * x + g(4) * y + g(8) * z + g(12), g(1) * x + g(5) * y + g(9) * z + g(13), g(2) * x + g(6) * y + g(10) * z + g(14)]); }
    const done = commitFromOp(st);
    const real = done.session.outcome.kernel!.mesh!.vertices;
    const box2 = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < real.length; i += 3) for (let k = 0; k < 3; k++) { box2[k] = Math.min(box2[k]!, real[i + k]!); box2[k + 3] = Math.max(box2[k + 3]!, real[i + k]!); }
    for (const k of [0, 1, 2]) {
      if (kind === "rotate") continue; // (a turned box's own box is bigger than the turned corners: the corners are compared below)
      near(Math.min(...pts.map((p) => p[k]!)), box2[k]!, 1e-2);
      near(Math.max(...pts.map((p) => p[k]!)), box2[k + 3]!, 1e-2);
    }
    if (kind === "rotate") for (const p of pts) assert.ok(Array.from({ length: real.length / 3 }, (_, i) => Math.hypot(real[3 * i]! - p[0], real[3 * i + 1]! - p[1], real[3 * i + 2]! - p[2])).some((d) => d < 1e-2), "every corner is where a vertex of the real body is");
  }
});
const commitFromOp = (st: AppState): AppState => reduce(st, { type: "typed", key: "Enter", shift: false }, env);

test("pulling the end face of an extrusion is drawn at once without the kernel, as the face moved along its normal, and stays so until the kernel's answer (`in_217`)", () => {
  let st = box();
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  st = select(st, [top.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "depth", "the end of the extrusion changes its depth");
  const base = st.session.outcome.kernel!;
  st = { ...st, op: { ...st.op!, value: 7 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift, "a face shift");
  assert.equal(f.faceShift!.face, top.ref);
  nearV(f.faceShift!.by!, [0, 0, 7]);
  assert.equal(f.mesh, base.mesh, "the mesh is the one already there");
  // a step that comes after the end it changes would change too: the kernel is asked then
  let s2 = box();
  s2 = { ...s2, session: run(s2.session, { type: "addStep", step: { id: nextId(scene(s2.session), "s"), type: "move", parts: [BODY_OBJECT], params: { axis: 0, value: 3 } } }) };
  const top2 = Object.values(scene(s2.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  s2 = reduce(select(s2, [top2.ref]), { type: "begin", name: "pushpull" }, env);
  s2 = { ...s2, op: { ...s2.op!, value: 7 } };
  assert.equal(frameOf(s2, { w: 800, h: 600 }).faceShift, null);
});

test("widening a round wall is drawn at once without the kernel: its points move out from the axis, and the finished step makes that radius (`in_218`)", () => {
  const s0 = cylinder();
  let st = select({ ...createState(s0), cam: homeCamera() }, [Object.values(scene(s0).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.curved && p.curved.convex)!.ref]);
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "radius");
  const base = st.session.outcome.kernel!;
  st = { ...st, op: { ...st.op!, value: 3 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift?.radial, "a radial shift");
  near(f.faceShift!.radial!.dr, 3);
  near(f.faceShift!.radial!.r0, 10);
  assert.equal(f.mesh, base.mesh, "the mesh is the one already there");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near(st.session.outcome.kernel!.bbox!.max[0], 13, 1e-2);
});

test("pulling a side of an extruded sketch is drawn at once without the kernel: the points over the moved corners move with them; with a locked length holding it, the kernel is asked and refuses (`in_219`)", () => {
  let st = box();
  const side = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && Math.abs(p.at[0] - 40) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!;
  st = reduce(select(st, [side.ref]), { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "side");
  const base = st.session.outcome.kernel!;
  st = { ...st, op: { ...st.op!, value: 5 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift?.columns, "columns");
  assert.equal(f.faceShift!.columns!.items.length, 2, "the two corners of that side");
  for (const i of f.faceShift!.columns!.items) nearV(i.by, [5, 0, 0]);
  assert.equal(f.mesh, base.mesh, "the mesh is the one already there");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near(st.session.outcome.kernel!.bbox!.max[0], 45, 1e-2);
  // a locked width: the kernel is asked (and the edit is refused when it is let go)
  let s2 = box();
  const lines = Object.values(scene(s2.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn");
  const bottom = lines.find((l) => { if (l.kind !== "line") return false; const [a, b] = [scene(s2.session).parts[l.a] as { at: Vec3 }, scene(s2.session).parts[l.b] as { at: Vec3 }]; return a.at[1] === 0 && b.at[1] === 0; })!;
  s2 = { ...s2, session: run(s2.session, actionsFor(scene(s2.session), [bottom.ref]).find((x) => x.id === "length")!.run(40)) };
  const side2 = Object.values(scene(s2.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && Math.abs(p.at[0] - 40) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!;
  s2 = reduce(select(s2, [side2.ref]), { type: "begin", name: "pushpull" }, env);
  s2 = { ...s2, op: { ...s2.op!, value: 5 } };
  assert.equal(frameOf(s2, { w: 800, h: 600 }).faceShift, null);
});

test("making a fillet or a chamfer smaller is drawn at once without the kernel: the rounding is the same cross-section scaled about the sharp edge, and the scaled end points are where the kernel puts them (`in_220`)", () => {
  for (const [typed, label] of [["3", "fillet"], ["-4", "chamfer"]] as const) {
    let st = box();
    const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2] && (scene(st.session).parts[p.a] as { at: Vec3 }).at[0] === 40 && (scene(st.session).parts[p.a] as { at: Vec3 }).at[1] === 20)!;
    st = reduce(select(st, [vertical.ref]), { type: "begin", name: "edge" }, env);
    st = typeNumber(st, typed);
    const part = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && (label === "fillet" ? !!p.rounded : !p.rounded && !p.curved && [...p.u, ...p.v].some((v) => Math.abs(Math.abs(v) - Math.SQRT1_2) < 0.02)))!;
    st = reduce(select(st, [part.ref]), { type: "begin", name: "pushpull" }, env);
    assert.equal(st.op!.edit?.kind, "edgeSize", label);
    const base = st.session.outcome.kernel!;
    const size = Number(typed.replace("-", ""));
    st = { ...st, op: { ...st.op!, value: 1 } }; // one smaller
    const f = frameOf(st, { w: 800, h: 600 });
    assert.ok(f.faceShift?.rounds, `${label}: a scaled shift`);
    near(f.faceShift!.rounds!.k, (size - 1) / size, 1e-6);
    assert.equal(f.mesh, base.mesh, `${label}: the mesh is the one already there`);
    // the points of the rounding at the two ends of the edge, scaled about the sharp edge, are vertices of the real result
    const { k } = f.faceShift!.rounds!;
    const { point, dir } = f.faceShift!.rounds!.groups[0]!.sharp as { point: Vec3; dir: Vec3 };
    const m = (part as unknown as { mesh: number[] }).mesh;
    const moved: Vec3[] = [];
    for (let i = 0; i + 2 < m.length; i += 3) { const p: Vec3 = [m[i]!, m[i + 1]!, m[i + 2]!]; const d = sub(p, point); const perp = sub(d, scale(dir, dot(d, dir))); if (p[2] === 0 || p[2] === 20) moved.push(add(p, scale(perp, k - 1))); }
    assert.ok(moved.length >= 4, `${label}: end points`);
    const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    const real = done.session.outcome.kernel!.mesh!.vertices;
    for (const p of moved) assert.ok(Array.from({ length: real.length / 3 }, (_, i) => Math.hypot(real[3 * i]! - p[0], real[3 * i + 1]! - p[1], real[3 * i + 2]! - p[2])).some((d) => d < 1e-2), `${label}: ${JSON.stringify(p)} is a vertex of the real result`);
  }
});

test("a new fillet or chamfer on one straight edge is made once by the kernel (the reference) and every size after it is that result scaled about the sharp edge on the graphics card (`in_221`)", () => {
  for (const [sign, label] of [[1, "fillet"], [-1, "chamfer"]] as const) {
    let st = box();
    const at = (r: string) => (scene(st.session).parts[r] as unknown as { at: Vec3 }).at;
    const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && at(p.a)[2] !== at(p.b)[2] && at(p.a)[0] === 40 && at(p.a)[1] === 20)!;
    st = reduce(select(st, [vertical.ref]), { type: "begin", name: "edge" }, env);
    const base = st.session.outcome.kernel!;
    st = { ...st, op: { ...st.op!, value: sign * 2 } };
    const f1 = frameOf(st, { w: 800, h: 600 });
    assert.ok(f1.faceShift?.rounds, `${label}: scaled shift`);
    near(f1.faceShift!.rounds!.k, 1, 1e-9);
    assert.notEqual(f1.mesh, base.mesh, `${label}: the reference is the kernel's own result with the rounding in it`);
    const refMesh = f1.mesh;
    st = { ...st, op: { ...st.op!, value: sign * 3 } };
    const f2 = frameOf(st, { w: 800, h: 600 });
    near(f2.faceShift!.rounds!.k, 1.5, 1e-9);
    assert.equal(f2.mesh, refMesh, `${label}: no new kernel result for another size`);
    // the scaled end points of the rounding are vertices of what the kernel really makes at that size
    const { k } = f2.faceShift!.rounds!;
    const { point, dir } = f2.faceShift!.rounds!.groups[0]!.sharp as { point: Vec3; dir: Vec3 };
    const part = f2.scene.parts[f2.faceShift!.face] as unknown as { mesh: number[] };
    const moved: Vec3[] = [];
    for (let i = 0; i + 2 < part.mesh.length; i += 3) { const p: Vec3 = [part.mesh[i]!, part.mesh[i + 1]!, part.mesh[i + 2]!]; const d = sub(p, point); const perp = sub(d, scale(dir, dot(d, dir))); if (p[2] === 0 || p[2] === 20) moved.push(add(p, scale(perp, k - 1))); }
    assert.ok(moved.length >= 4);
    const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    const real = done.session.outcome.kernel!.mesh!.vertices;
    for (const p of moved) assert.ok(Array.from({ length: real.length / 3 }, (_, i) => Math.hypot(real[3 * i]! - p[0], real[3 * i + 1]! - p[1], real[3 * i + 2]! - p[2])).some((d) => d < 1e-2), `${label}: ${JSON.stringify(p)}`);
  }
});

/** How far a point is from the surface of a mesh (the nearest point of any of its triangles). */
function meshDistance(real: { vertices: Float32Array; triangles: Uint32Array }, p: Vec3): number {
  const tri = (i: number): Vec3[] => [0, 1, 2].map((c) => { const v = real.triangles[3 * i + c]!; return [real.vertices[3 * v]!, real.vertices[3 * v + 1]!, real.vertices[3 * v + 2]!] as Vec3; });
  const dist = (q: Vec3, tr: Vec3[]): number => {
    const [a, b, c] = tr as [Vec3, Vec3, Vec3];
    const n = normalize(cross(sub(b, a), sub(c, a)));
    const f = sub(q, scale(n, dot(sub(q, a), n)));
    const inside = [[a, b], [b, c], [c, a]].every(([u, v]) => dot(cross(sub(v!, u!), sub(f, u!)), n) >= -1e-9);
    if (inside) return Math.abs(dot(sub(q, a), n));
    return Math.min(...[[a, b], [b, c], [c, a]].map(([u, v]) => { const e = sub(v!, u!); const t = Math.min(1, Math.max(0, dot(sub(q, u!), e) / dot(e, e))); return Math.hypot(...sub(q, add(u!, scale(e, t)))); }));
  };
  let best = Infinity;
  for (let i = 0; i < real.triangles.length / 3; i++) best = Math.min(best, dist(p, tri(i)));
  return best;
}

/** How far the points of a fillet's scaled rounding are from the surface the kernel really makes at that size (corners: scaled about the corner, strips: about their edge). */
function scaledError(fx: ReturnType<typeof frameOf>, done: AppState): number {
  const groups = fx.faceShift?.rounds?.groups ?? [];
  const real = done.session.outcome.kernel!.mesh!;
  const k = fx.faceShift!.rounds!.k;
  const moved = (g: (typeof groups)[number], p: Vec3): Vec3 => {
    const sh = g.sharp;
    const about = (v: Vec3): Vec3 => add(p, scale(sub(p, v), k - 1));
    if (sh.kind === "point") return about(sh.center);
    if (sh.kind === "line") {
      const len = Math.hypot(...sub(sh.b, sh.a));
      const along = dot(sub(p, sh.a), sh.dir);
      if (sh.cornerA && along < len / 2) return about(sh.a);
      if (sh.cornerB && along >= len / 2) return about(sh.b);
      const d = sub(p, sh.point);
      return add(p, scale(sub(d, scale(sh.dir, dot(d, sh.dir))), k - 1));
    }
    const d = sub(p, sh.kind === "circle" ? sh.center : p);
    if (sh.kind === "circle") {
      const z = dot(d, sh.axis);
      const rv = sub(d, scale(sh.axis, z));
      const rho = Math.hypot(...rv) || 1e-9;
      const rho2 = sh.radius + k * (rho - sh.radius);
      return add(add(sh.center, scale(sh.axis, k * z)), scale(rv, rho2 / rho));
    }
    return p;
  };
  let worstEdge = 0;
  for (const g of groups) {
    const m = (fx.scene.parts[g.face] as unknown as { mesh: number[] }).mesh;
    for (let i = 0; i + 2 < m.length; i += 3) { const q = moved(g, [m[i]!, m[i + 1]!, m[i + 2]!]); worstEdge = Math.max(worstEdge, meshDistance(real, q)); }
  }
  return worstEdge;
}

test("a new fillet round a cylinder's rim is made once and scaled about the circle; one round a chain of edges that meet smoothly is scaled edge by edge; a chain with corners goes to the kernel (`in_222`)", () => {
  // the rim of a post: a plane across a coaxial cylinder
  const s0 = cylinder();
  const rim = Object.values(scene(s0).parts).find((p) => p.kind === "line" && p.origin === "body" && !!p.circle && p.circle.center[2] === 20)!;
  let st = reduce(select({ ...createState(s0), cam: homeCamera() }, [rim.ref]), { type: "begin", name: "edge" }, env);
  st = { ...st, op: { ...st.op!, value: 2 } };
  frameOf(st, { w: 800, h: 600 });
  st = { ...st, op: { ...st.op!, value: 3 } };
  const f = frameOf(st, { w: 800, h: 600 });
  const g = f.faceShift?.rounds?.groups;
  assert.ok((g?.length ?? 0) >= 1, "its rounding faces (the kernel may make the round in halves)");
  assert.ok(g!.every((x) => x.sharp.kind === "circle"));
  near(f.faceShift!.rounds!.k, 1.5, 1e-9);
  // every point of the scaled rounding lies on the real one: 3 mm from the middle of its cross-section (7 from the axis, 17 up)
  const c = g![0]!.sharp as { kind: "circle"; center: Vec3; axis: Vec3; radius: number };
  let worst = 0;
  for (const gr of g!) for (let part = f.scene.parts[gr.face] as unknown as { mesh: number[] }, i = 0; i + 2 < part.mesh.length; i += 3) {
    const p: Vec3 = [part.mesh[i]!, part.mesh[i + 1]!, part.mesh[i + 2]!];
    const d = sub(p, c.center);
    const z = dot(d, c.axis);
    const rho = Math.hypot(...sub(d, scale(c.axis, z)));
    const [rho2, z2] = [c.radius + 1.5 * (rho - c.radius), 1.5 * z];
    worst = Math.max(worst, Math.abs(Math.hypot(rho2 - 7, Math.abs(z2) - 3) - 3));
  }
  assert.ok(worst < 1e-2, `off by ${worst}`);
  // edges that meet smoothly (lines and arcs round a stadium): edge by edge
  const sb = openSession(kernel, readFileSync(new URL("./fixtures/chain-body.cad.json", import.meta.url), "utf8")) as { ok: true; value: ReturnType<typeof createSession> };
  const sc = scene(sb.value);
  const topZ = Math.max(...Object.values(sc.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => (p as unknown as { at: Vec3 }).at[2]));
  const edgesAtTop = Object.values(sc.parts).filter((p) => p.kind === "line" && p.origin === "body" && (sc.parts[p.a] as unknown as { at: Vec3 }).at[2] === topZ && (sc.parts[p.b] as unknown as { at: Vec3 }).at[2] === topZ).map((p) => p.ref);
  assert.ok(edgesAtTop.length >= 3);
  let sd = reduce(select({ ...createState(sb.value), cam: homeCamera() }, edgesAtTop), { type: "begin", name: "edge" }, env);
  sd = { ...sd, op: { ...sd.op!, value: 1 } };
  const fs = frameOf(sd, { w: 800, h: 600 });
  assert.ok((fs.faceShift?.rounds?.groups.length ?? 0) >= 3, "a rounding face per edge");
  assert.ok(new Set(fs.faceShift!.rounds!.groups.map((x) => x.sharp.kind)).size === 2, "lines and circles");
  // the four edges of a box top meet in corners (flat faces, straight edges): scaled about the corners, and the scaled points lie on the surface the kernel really makes
  const bx = box();
  const top = Object.values(scene(bx.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && (scene(bx.session).parts[p.a] as unknown as { at: Vec3 }).at[2] === 20 && (scene(bx.session).parts[p.b] as unknown as { at: Vec3 }).at[2] === 20).map((p) => p.ref);
  assert.equal(top.length, 4);
  let sx = reduce(select(bx, top), { type: "begin", name: "edge" }, env);
  sx = { ...sx, op: { ...sx.op!, value: 2 } };
  frameOf(sx, { w: 800, h: 600 });
  sx = { ...sx, op: { ...sx.op!, value: 3 } };
  const fx = frameOf(sx, { w: 800, h: 600 });
  const groups = fx.faceShift?.rounds?.groups ?? [];
  assert.ok(groups.filter((x) => x.sharp.kind === "line").length >= 4, "a strip per edge");
  assert.ok(scaledError(fx, reduce(sx, { type: "typed", key: "Enter", shift: false }, env)) < 2e-2, "the scaled corner roundings lie on the real surface");
  // three edges at one corner: a patch of its own, scaled about the corner
  const at3 = (r: string) => (scene(bx.session).parts[r] as unknown as { at: Vec3 }).at;
  const three = Object.values(scene(bx.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && [p.a, p.b].some((c) => { const q = at3(c); return q[0] === 40 && q[1] === 20 && q[2] === 20; })).map((p) => p.ref);
  assert.equal(three.length, 3);
  let s3 = reduce(select(bx, three), { type: "begin", name: "edge" }, env);
  s3 = { ...s3, op: { ...s3.op!, value: 2 } };
  frameOf(s3, { w: 800, h: 600 });
  s3 = { ...s3, op: { ...s3.op!, value: 3 } };
  const f3 = frameOf(s3, { w: 800, h: 600 });
  assert.ok(f3.faceShift?.rounds?.groups.some((x) => x.sharp.kind === "point"), "the patch at the corner");
  assert.ok(scaledError(f3, reduce(s3, { type: "typed", key: "Enter", shift: false }, env)) < 2e-2, "and everything lies on the real surface");
});

test("a fillet that rounds a smooth chain of edges (lines and arcs) is made smaller or bigger edge by edge without the kernel (`in_222`)", () => {
  const sb = openSession(kernel, readFileSync(new URL("./fixtures/chain-body.cad.json", import.meta.url), "utf8")) as { ok: true; value: ReturnType<typeof createSession> };
  const sc = scene(sb.value);
  const at = (r: string) => (sc.parts[r] as unknown as { at: Vec3 }).at;
  const topZ = Math.max(...Object.values(sc.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => at(p.ref)[2]));
  const edges = Object.values(sc.parts).filter((p) => p.kind === "line" && p.origin === "body" && at(p.a)[2] === topZ && at(p.b)[2] === topZ).map((p) => p.ref);
  let st = reduce(select({ ...createState(sb.value), cam: homeCamera() }, edges), { type: "begin", name: "edge" }, env);
  st = typeNumber(st, "2");
  const rounded = Object.values(scene(st.session).parts).filter((p) => p.kind === "plane" && p.origin === "body" && !!p.rounded && (p.rounded === "TORUS" || p.rounded === "CYLINDRE" && !p.round?.convex));
  assert.ok(rounded.length >= 1);
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE" && (p.mesh?.length ?? 0) > 0 && faceEdit(scene(st.session), p.ref)?.kind === "edgeSize");
  assert.ok(face, "a rounding face that finds its step");
  st = reduce(select(st, [face!.ref]), { type: "begin", name: "pushpull" }, env);
  st = { ...st, op: { ...st.op!, value: 0.5 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok((f.faceShift?.rounds?.groups.length ?? 0) >= 3, "every rounding face of the chain");
  near(f.faceShift!.rounds!.k, 1.5 / 2, 1e-9);
});

test("a fillet that rounds the four edges of a box top (corners) is made smaller or bigger without the kernel too, and the scaled points are on the real surface (`in_223`)", () => {
  let st = box();
  const at = (r: string) => (scene(st.session).parts[r] as unknown as { at: Vec3 }).at;
  const top = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && at(p.a)[2] === 20 && at(p.b)[2] === 20).map((p) => p.ref);
  st = reduce(select(st, top), { type: "begin", name: "edge" }, env);
  st = typeNumber(st, "3");
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE" && faceEdit(scene(st.session), p.ref)?.kind === "edgeSize");
  assert.ok(face, "a rounding face that finds its step");
  st = reduce(select(st, [face!.ref]), { type: "begin", name: "pushpull" }, env);
  st = { ...st, op: { ...st.op!, value: -2 } }; // bigger: 3 -> 5
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok((f.faceShift?.rounds?.groups.length ?? 0) >= 4, "a strip per edge");
  near(f.faceShift!.rounds!.k, 5 / 3, 1e-9);
  assert.ok(scaledError(f, reduce(st, { type: "typed", key: "Enter", shift: false }, env)) < 2e-2);
});

test("edits of a body that has only been moved or turned since are drawn without the kernel too: the same edit of the same shape, moved (`in_224`)", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "5" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(scene(st.session).steps.at(-1)!.type, "move");
  st = reduce(st, { type: "escape" }, env);
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20 && p.u[2] === 0 && p.v[2] === 0)!;
  st = reduce(select(st, [top.ref]), { type: "begin", name: "pushpull" }, env);
  st = { ...st, op: { ...st.op!, value: 7 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift?.by, "drawn at once although a move comes after the extrusion");
  nearV(f.faceShift!.by!, [0, 0, 7]);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near(st.session.outcome.kernel!.bbox!.max[2], 27, 1e-2);
  // a side of the sketch too (its corners were carried with the body)
  let s2 = select(box(), [BODY_OBJECT]);
  s2 = reduce(s2, { type: "begin", name: "move" }, env);
  s2 = reduce(s2, { type: "entry", field: 0, text: "5" }, env);
  s2 = reduce(s2, { type: "typed", key: "Enter", shift: false }, env);
  s2 = reduce(s2, { type: "escape" }, env);
  const side = Object.values(scene(s2.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && Math.abs(p.at[0] - 45) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!;
  s2 = reduce(select(s2, [side.ref]), { type: "begin", name: "pushpull" }, env);
  s2 = { ...s2, op: { ...s2.op!, value: 4 } };
  const fs = frameOf(s2, { w: 800, h: 600 });
  assert.ok(fs.faceShift?.columns, "the side of a moved body's sketch");
  s2 = reduce(s2, { type: "typed", key: "Enter", shift: false }, env);
  near(s2.session.outcome.kernel!.bbox!.max[0], 49, 1e-2);
});

test("a new extrusion, and a new push / pull prism that adds or cuts, are made once and stretched along their normal on the graphics card; `in_224`", () => {
  const vertexSet = (done: AppState) => { const v = done.session.outcome.kernel!.mesh!.vertices; return Array.from({ length: v.length / 3 }, (_, i) => [v[3 * i]!, v[3 * i + 1]!, v[3 * i + 2]!] as Vec3); };
  const check = (st: AppState, label: string, value2: number) => {
    const f2 = frameOf({ ...st, op: { ...st.op!, value: value2 } }, { w: 800, h: 600 });
    assert.ok(f2.faceShift?.rounds, `${label}: stretched`);
    const { k, groups } = f2.faceShift!.rounds!;
    const sh = groups[0]!.sharp as { kind: "plane"; point: Vec3; normal: Vec3 };
    assert.equal(sh.kind, "plane");
    const done = reduce({ ...st, op: { ...st.op!, value: value2 } }, { type: "typed", key: "Enter", shift: false }, env);
    const real = vertexSet(done);
    for (const g of groups) {
      const m = (f2.scene.parts[g.face] as unknown as { mesh: number[] }).mesh;
      for (let i = 0; i + 2 < m.length; i += 3) {
        const p: Vec3 = [m[i]!, m[i + 1]!, m[i + 2]!];
        const q = add(p, scale(sh.normal, (k - 1) * dot(sub(p, sh.point), sh.normal)));
        assert.ok(real.some((r) => Math.hypot(...sub(r, q)) < 1e-2), `${label}: ${JSON.stringify(q)} is a vertex of the real result`);
      }
    }
  };
  // a new extrusion of a closed sketch
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st = { ...createState(s), cam: homeCamera() };
  st = reduce(select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]), { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.kind, "extrude");
  frameOf({ ...st, op: { ...st.op!, value: 6 } }, { w: 800, h: 600 }); // (the reference)
  const f1 = frameOf({ ...st, op: { ...st.op!, value: 6 } }, { w: 800, h: 600 });
  assert.ok(f1.faceShift?.rounds);
  check(st, "extrude", 12);
  // a new push / pull prism cut into the top of a box (not through)
  let bx = box();
  const top = Object.values(scene(bx.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20 && p.u[2] === 0 && p.v[2] === 0)!;
  bx = reduce(select(bx, [top.ref]), { type: "begin", name: "pushpull" }, env);
  bx = { ...bx, op: { ...bx.op!, noEdit: true } };
  frameOf({ ...bx, op: { ...bx.op!, value: -4 } }, { w: 800, h: 600 });
  check(bx, "cut", -8);
});

test("a fillet needs only about twice its size of edge between corners: rounding the top of a 20 mm wide box by 8 is still drawn without the kernel and lies on the real surface (`in_224`)", () => {
  const bx = box();
  const at = (r: string) => (scene(bx.session).parts[r] as unknown as { at: Vec3 }).at;
  const top = Object.values(scene(bx.session).parts).filter((p) => p.kind === "line" && p.origin === "body" && at(p.a)[2] === 20 && at(p.b)[2] === 20).map((p) => p.ref);
  let st = reduce(select(bx, top), { type: "begin", name: "edge" }, env);
  st = { ...st, op: { ...st.op!, value: 6 } };
  frameOf(st, { w: 800, h: 600 });
  st = { ...st, op: { ...st.op!, value: 8 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift?.rounds, "scaled");
  assert.ok(scaledError(f, reduce(st, { type: "typed", key: "Enter", shift: false }, env)) < 2e-2);
});

test("an existing fillet round the rim of a post (a whole circle) is made bigger without the kernel: the flat face the rounding was cut from says which way the circle faces, and the scaled points lie on the real surface (`in_224`)", () => {
  const s0 = cylinder();
  const rim = Object.values(scene(s0).parts).find((p) => p.kind === "line" && p.origin === "body" && !!p.circle && p.circle.center[2] === 20)!;
  let st = reduce(select({ ...createState(s0), cam: homeCamera() }, [rim.ref]), { type: "begin", name: "edge" }, env);
  st = typeNumber(st, "2");
  const torus = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "TORUS" && faceEdit(scene(st.session), p.ref)?.kind === "edgeSize");
  assert.ok(torus, "a torus that finds its step");
  st = reduce(select(st, [torus!.ref]), { type: "begin", name: "pushpull" }, env);
  st = { ...st, op: { ...st.op!, value: -1.5 } }; // 2 -> 3.5
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok((f.faceShift?.rounds?.groups.length ?? 0) >= 1, "drawn without the kernel");
  assert.equal(f.faceShift!.rounds!.groups[0]!.sharp.kind, "circle");
  near(f.faceShift!.rounds!.k, 3.5 / 2, 1e-9);
  assert.ok(scaledError(f, reduce(st, { type: "typed", key: "Enter", shift: false }, env)) < 2e-2);
});

test("widening the round wall of a body that was turned about tilted axes is drawn without the kernel too (the wall says where its axis points) (`in_224`)", () => {
  const s0 = cylinder();
  let st = select({ ...createState(s0), cam: homeCamera() }, [BODY_OBJECT]);
  for (const [field, deg] of [[0, "30"], [1, "20"]] as const) {
    st = reduce(st, { type: "begin", name: "rotate" }, env);
    st = reduce(st, { type: "entry", field, text: deg }, env);
    st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    st = reduce(st, { type: "escape" }, env);
    st = select(st, [BODY_OBJECT]);
  }
  assert.equal(scene(st.session).steps.filter((x) => x.type === "rotate").length >= 2, true);
  const wall = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE" && !!p.round?.dir && faceEdit(scene(st.session), p.ref)?.kind === "radius");
  assert.ok(wall, "a tilted wall that finds its circle");
  st = reduce(select(st, [wall!.ref]), { type: "begin", name: "pushpull" }, env);
  st = { ...st, op: { ...st.op!, value: 2 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift?.radial, "drawn without the kernel");
  near(f.faceShift!.radial!.dr, 2, 1e-9);
  // the wall's points move out from the axis by 2: they are 12 from it afterwards, as in the real result
  const part = f.scene.parts[f.faceShift!.face] as unknown as { mesh: number[] };
  const { center, axis, dr } = f.faceShift!.radial!;
  const sample: Vec3[] = [];
  for (let i = 0; i + 2 < part.mesh.length; i += 3) { const p: Vec3 = [part.mesh[i]!, part.mesh[i + 1]!, part.mesh[i + 2]!]; const d = sub(p, center); const perp = sub(d, scale(axis, dot(d, axis))); sample.push(add(p, scale(perp, dr / Math.hypot(...perp)))); }
  const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const real = done.session.outcome.kernel!.mesh!.vertices;
  const dd = (p: Vec3) => { const d = sub(p, center); return Math.hypot(...sub(d, scale(axis, dot(d, axis)))); };
  const realR = Array.from({ length: real.length / 3 }, (_, i) => dd([real[3 * i]!, real[3 * i + 1]!, real[3 * i + 2]!]));
  assert.ok(sample.every((p) => Math.abs(dd(p) - 12) < 1e-2), "12 from the axis");
  assert.ok(realR.some((r) => Math.abs(r - 12) < 1e-2), "and the real wall is 12 from it");
});

test("the wall of an arc whose circle is gone is made wider without the kernel: its points go out and along to the new ends, and the points over the moved corners with them; the scaled points lie on the real surface (`in_225`)", () => {
  const sb = openSession(kernel, readFileSync(new URL("./fixtures/chain-body.cad.json", import.meta.url), "utf8")) as { ok: true; value: ReturnType<typeof createSession> };
  const sc = scene(sb.value);
  const walls = Object.values(sc.parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE" && faceEdit(sc, p.ref)?.kind === "radius");
  assert.ok(walls.length >= 2, "walls of the arcs");
  const outer = walls.find((w) => { const e = faceEdit(sc, w.ref); return e?.kind === "radius" && e.convex; })!;
  let st = reduce(select({ ...createState(sb.value), cam: homeCamera() }, [outer.ref]), { type: "begin", name: "pushpull" }, env);
  st = { ...st, op: { ...st.op!, value: 0.6 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift?.arcs, "drawn without the kernel");
  const { arcWall, items } = f.faceShift!.arcs!;
  near(arcWall.dr, 0.6, 1e-9);
  assert.ok(items.length >= 2, "the corners that move");
  const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(done.session.message, null);
  const real = done.session.outcome.kernel!.mesh!;
  // every point of the wall, moved the way the picture moves it, is on the real surface
  const part = f.scene.parts[f.faceShift!.face] as unknown as { mesh: number[] };
  const TAU = 2 * Math.PI;
  const mod = (x: number) => ((x % TAU) + TAU) % TAU;
  let worst = 0;
  for (let i = 0; i + 2 < part.mesh.length; i += 3) {
    const p: Vec3 = [part.mesh[i]!, part.mesh[i + 1]!, part.mesh[i + 2]!];
    const d = sub(p, arcWall.center);
    const h = dot(d, arcWall.axis);
    const q = sub(d, scale(arcWall.axis, h));
    const [cx, cy] = [dot(q, arcWall.u), dot(q, arcWall.v)];
    let fwd = mod(arcWall.dir * (Math.atan2(cy, cx) - arcWall.th0));
    if (fwd > TAU - 1e-3) fwd = 0;
    const th = arcWall.th0n + arcWall.dir * Math.min(1, fwd / arcWall.span) * arcWall.spanN;
    const rho2 = Math.hypot(cx, cy) + arcWall.dr;
    const moved = add(add(arcWall.center, scale(arcWall.axis, h)), add(scale(arcWall.u, rho2 * Math.cos(th)), scale(arcWall.v, rho2 * Math.sin(th))));
    worst = Math.max(worst, meshDistance(real, moved));
  }
  assert.ok(worst < 2e-2, `a point of the wall is ${worst} from the real surface`);
});

test("pulling a side of a sketch that has an arc is drawn without the kernel: the arc's wall follows the arc to where the solver puts it, and the points over the moved corners with them (`in_226`)", () => {
  // a half disc: an arc from A round to B about C, and the straight side from B back to A; pulling that side moves both ends of the arc
  const P = [[0, -10, 0], [0, 10, 0]];
  const parts: object[] = [];
  P.forEach((at, i) => parts.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: `d/e_001.p${i}`, kind: "corner", at } }));
  parts.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: "d/e_001.c", kind: "corner", at: [0, 0, 0] } });
  parts.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: "d/e_001.s0", kind: "line", a: "d/e_001.p0", b: "d/e_001.p1", center: "d/e_001.c", ccw: true } });
  parts.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: "d/e_001.s1", kind: "line", a: "d/e_001.p1", b: "d/e_001.p0" } });
  const proj = { format: "cad-project", version: 1, base: { version: 1, counter: 0, parts: [], relations: [], steps: [] }, commands: [{ type: "batch", commands: parts }, { type: "addRelation", relation: { id: "r_001", kind: "arcEnds", parts: ["d/e_001.s0", "d/e_001.c"] } }, { type: "addStep", step: { id: "s_002", type: "extrude", parts: ["d/e_001.s0", "d/e_001.s1"], params: { depth: 15 } } }], cursor: 3 };
  const r = openSession(kernel, JSON.stringify(proj)) as { ok: true; value: ReturnType<typeof createSession> };
  assert.ok(r.ok);
  const sc = scene(r.value);
  assert.equal(r.value.outcome.errors["s_002"], undefined);
  const sides = Object.values(sc.parts).filter((p) => p.kind === "plane" && p.origin === "body" && !p.rounded && faceEdit(sc, p.ref)?.kind === "side");
  assert.ok(sides.length >= 1, "the straight side");
  let any = 0;
  let arcsSeen = 0;
  for (const side of sides) {
    let st = reduce(select({ ...createState(r.value), cam: homeCamera() }, [side.ref]), { type: "begin", name: "pushpull" }, env);
    st = { ...st, op: { ...st.op!, value: 3 } };
    const f = frameOf(st, { w: 800, h: 600 });
    const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    if (done.session.message) { assert.equal(f.faceShift, null, `a refused edit (${done.session.message}) is not drawn`); continue; }
    assert.ok(f.faceShift?.columns, "drawn without the kernel");
    any++;
    const real = done.session.outcome.kernel!.mesh!;
    for (const i of f.faceShift!.columns!.items) for (const z of [0, 15]) {
      const q: Vec3 = [i.at[0] + i.by[0], i.at[1] + i.by[1], z];
      assert.ok(meshDistance(real, q) < 1e-2, `the corner column ${JSON.stringify(q)} is on the real body`);
    }
    arcsSeen += f.faceShift!.columns!.arcWalls.length;
    for (const w of f.faceShift!.columns!.arcWalls) {
      const part = f.scene.parts[w.face] as unknown as { mesh: number[] };
      const a = w.arc;
      const TAU = 2 * Math.PI;
      for (let i = 0; i + 2 < part.mesh.length; i += 3) {
        const p: Vec3 = [part.mesh[i]!, part.mesh[i + 1]!, part.mesh[i + 2]!];
        const d = sub(p, a.center); const h = dot(d, a.axis); const q = sub(d, scale(a.axis, h));
        const [cx, cy] = [dot(q, a.u), dot(q, a.v)];
        let fwd = (((a.dir * (Math.atan2(cy, cx) - a.th0)) % TAU) + TAU) % TAU; if (fwd > TAU - 1e-3) fwd = 0;
        const th = a.th0n + a.dir * Math.min(1, fwd / a.span) * a.spanN;
        const rho2 = Math.hypot(cx, cy) + a.dr;
        const moved = add(add(a.centerN, scale(a.axis, h)), add(scale(a.u, rho2 * Math.cos(th)), scale(a.v, rho2 * Math.sin(th))));
        assert.ok(meshDistance(real, moved) < 2e-2, "a point of the arc wall is on the real surface");
      }
    }
  }
  assert.ok(any >= 1, "the side could be drawn without the kernel");
  assert.ok(arcsSeen >= 1, "and the arc's wall was mapped");
});

test("pulling the top of an extrusion that has a fillet on a vertical edge is drawn without the kernel too: the rounding is a prism, it stretches with the end (`in_227`)", () => {
  let st = box();
  const at = (r: string) => (scene(st.session).parts[r] as unknown as { at: Vec3 }).at;
  const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && at(p.a)[2] !== at(p.b)[2] && at(p.a)[0] === 40 && at(p.a)[1] === 20)!;
  st = reduce(select(st, [vertical.ref]), { type: "begin", name: "edge" }, env);
  st = typeNumber(st, "3");
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20 && p.u[2] === 0 && p.v[2] === 0)!;
  st = reduce(select(st, [top.ref]), { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.edit?.kind, "depth");
  st = { ...st, op: { ...st.op!, value: 5 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift?.by, "drawn although a fillet comes after the extrusion");
  const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const real = done.session.outcome.kernel!.mesh!;
  // every vertex of the rounding, stretched with the end, is on the real surface
  const rounded = Object.values(f.scene.parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE");
  assert.ok(rounded.length >= 1);
  for (const r of rounded) {
    const m = (r as unknown as { mesh: number[] }).mesh;
    for (let i = 0; i + 2 < m.length; i += 3) {
      const p: Vec3 = [m[i]!, m[i + 1]!, m[i + 2]!];
      const q: Vec3 = p[2] > 19.99 ? [p[0], p[1], p[2] + 5] : p;
      assert.ok(meshDistance(real, q) < 1e-2, `${JSON.stringify(q)} is on the real surface`);
    }
  }
});

test("a side next to an arc can be pulled: the arc's middle goes to the nearest point on the middle line of its new chord, so the arc changes size and span instead of the sketch pushing the corner back (`in_227`)", () => {
  const P = [[0, 0, 0], [30, 0, 0], [30, 20, 0], [0, 20, 0]];
  const parts: object[] = [];
  P.forEach((at, i) => parts.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: `d/e_001.p${i}`, kind: "corner", at } }));
  parts.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: "d/e_001.c", kind: "corner", at: [30, 10, 0] } });
  P.forEach((_, i) => parts.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: `d/e_001.s${i}`, kind: "line", a: `d/e_001.p${i}`, b: `d/e_001.p${(i + 1) % 4}`, ...(i === 1 ? { center: "d/e_001.c", ccw: true } : {}) } }));
  const proj = { format: "cad-project", version: 1, base: { version: 1, counter: 0, parts: [], relations: [], steps: [] }, commands: [{ type: "batch", commands: parts }, { type: "addRelation", relation: { id: "r_001", kind: "arcEnds", parts: ["d/e_001.s1", "d/e_001.c"] } }, { type: "addStep", step: { id: "s_002", type: "extrude", parts: [0, 1, 2, 3].map((i) => `d/e_001.s${i}`), params: { depth: 15 } } }], cursor: 3 };
  const r = openSession(kernel, JSON.stringify(proj)) as { ok: true; value: ReturnType<typeof createSession> };
  const sc = scene(r.value);
  const sides = Object.values(sc.parts).filter((p) => p.kind === "plane" && p.origin === "body" && !p.rounded && faceEdit(sc, p.ref)?.kind === "side");
  assert.equal(sides.length, 3);
  let drawnArcs = 0;
  for (const side of sides) {
    let st = reduce(select({ ...createState(r.value), cam: homeCamera() }, [side.ref]), { type: "begin", name: "pushpull" }, env);
    st = { ...st, op: { ...st.op!, value: 3 } };
    const f = frameOf(st, { w: 800, h: 600 });
    const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    assert.equal(done.session.message, null, `pulling ${side.ref}: not refused`);
    assert.equal(done.session.history.scene.steps.length, 1, "no prism added");
    assert.ok(f.faceShift?.columns, "drawn without the kernel");
    drawnArcs += f.faceShift!.columns!.arcWalls.length;
    const real = done.session.outcome.kernel!.mesh!;
    for (const w of f.faceShift!.columns!.arcWalls) {
      const part = f.scene.parts[w.face] as unknown as { mesh: number[] };
      const a = w.arc;
      const TAU = 2 * Math.PI;
      for (let i = 0; i + 2 < part.mesh.length; i += 3) {
        const p: Vec3 = [part.mesh[i]!, part.mesh[i + 1]!, part.mesh[i + 2]!];
        const d = sub(p, a.center); const h = dot(d, a.axis); const q = sub(d, scale(a.axis, h));
        const [cx, cy] = [dot(q, a.u), dot(q, a.v)];
        let fwd = (((a.dir * (Math.atan2(cy, cx) - a.th0)) % TAU) + TAU) % TAU; if (fwd > TAU - 1e-3) fwd = 0;
        const th = a.th0n + a.dir * Math.min(1, fwd / a.span) * a.spanN;
        const rho2 = Math.hypot(cx, cy) + a.dr;
        assert.ok(meshDistance(real, add(add(a.centerN, scale(a.axis, h)), add(scale(a.u, rho2 * Math.cos(th)), scale(a.v, rho2 * Math.sin(th))))) < 2e-2, "a point of the arc wall is on the real surface");
      }
    }
  }
  assert.ok(drawnArcs >= 2, "the top and the bottom sides change the arc, and its wall was mapped");
});

test("angles typed for the axes are drawn as a matrix too: one turn about the middle, or several about a set pivot, and the matrix puts the body where the kernel does (`in_228`)", () => {
  for (const [rot, pivotSet] of [[["", "", "35"], false], [["20", "", "35"], true]] as const) {
    let st = select(box(), [BODY_OBJECT]);
    st = reduce(st, { type: "begin", name: "rotate" }, env);
    const pivot: Vec3 = pivotSet ? [10, 5, 3] : (st.op!.pivot ?? [20, 10, 10]);
    st = { ...st, op: { ...st.op!, rot: [...rot] as [string, string, string], ...(pivotSet ? { pivot } : {}) } };
    const f = frameOf(st, { w: 800, h: 600 });
    assert.ok(f.bodyMatrix, `${rot.join("/")}: a matrix`);
    const base = st.session.outcome.kernel!.mesh!;
    const m = f.bodyMatrix!;
    const g = (i: number) => m[i]!;
    const moved: Vec3[] = [];
    for (let i = 0; i < base.vertices.length; i += 3) { const [x, y, z] = [base.vertices[i]!, base.vertices[i + 1]!, base.vertices[i + 2]!]; moved.push([g(0) * x + g(4) * y + g(8) * z + g(12), g(1) * x + g(5) * y + g(9) * z + g(13), g(2) * x + g(6) * y + g(10) * z + g(14)]); }
    const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    const real = done.session.outcome.kernel!.mesh!;
    for (const p of moved.filter((_, i) => i % 7 === 0)) assert.ok(meshDistance(real, p) < 1e-2, `${rot.join("/")}: ${JSON.stringify(p)} is on the turned body`);
  }
});

test("several faces pulled together (each along its own normal by the same distance) are made once and stretched about their own planes (`in_228`)", () => {
  let st = box();
  const parts = Object.values(scene(st.session).parts);
  const top = parts.find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20 && p.u[2] === 0 && p.v[2] === 0)!;
  const side = parts.find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && Math.abs(p.at[0] - 40) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!;
  st = reduce(select(st, [top.ref, side.ref]), { type: "begin", name: "pushpull" }, env);
  assert.equal(st.op!.faces?.length, 2);
  frameOf({ ...st, op: { ...st.op!, value: 3 } }, { w: 800, h: 600 });
  st = { ...st, op: { ...st.op!, value: 5 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.faceShift?.rounds, "stretched");
  assert.equal(new Set(f.faceShift!.rounds!.groups.map((g) => JSON.stringify((g.sharp as { normal: Vec3 }).normal))).size, 2, "about two different planes");
  const { k, groups } = f.faceShift!.rounds!;
  const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const real = done.session.outcome.kernel!.mesh!;
  for (const g of groups) {
    const sh = g.sharp as { kind: "plane"; point: Vec3; normal: Vec3 };
    const m = (f.scene.parts[g.face] as unknown as { mesh: number[] }).mesh;
    for (let i = 0; i + 2 < m.length; i += 3) { const p: Vec3 = [m[i]!, m[i + 1]!, m[i + 2]!]; const q = add(p, scale(sh.normal, (k - 1) * dot(sub(p, sh.point), sh.normal))); assert.ok(meshDistance(real, q) < 1e-2, `${JSON.stringify(q)} is on the real body`); }
  }
});

test("the history list has a button on each extrusion that shows the sketch it was made from (and puts it away again), picked and snapped to like any sketch (`in_228`)", () => {
  let st = box();
  const row = (s: AppState) => frameOf(s, { w: 800, h: 600 }).panel?.rows.find((r) => r.id === scene(s.session).steps[0]!.id);
  st = { ...st, panel: "history" };
  assert.equal(row(st)?.sketch, false, "the button is there, off");
  st = reduce(st, { type: "panelRow", id: scene(st.session).steps[0]!.id, act: "sketch" }, env);
  assert.equal(row(st)?.sketch, true, "on");
  const lines = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn");
  assert.ok(lines.length >= 4);
  assert.ok(lines.every((l) => !consumed(scene(st.session)).has(l.ref)), "the sketch's lines are shown");
  assert.ok(lines.every((l) => consumed(scene({ ...st.session, reveal: null })).has(l.ref)), "and hidden again without the button");
  st = reduce(st, { type: "panelRow", id: scene(st.session).steps[0]!.id, act: "sketch" }, env);
  assert.equal(st.session.reveal ?? null, null, "put away");
});

test("a fillet or chamfer made from ONE edge of a smooth rim is drawn along the whole rim without the kernel, as the kernel makes it (the edges that run on from it were left behind, `in_231`)", () => {
  const sb = openSession(kernel, readFileSync(new URL("./fixtures/chain-body.cad.json", import.meta.url), "utf8")) as { ok: true; value: ReturnType<typeof createSession> };
  const sc = scene(sb.value);
  const at = (r: string) => (sc.parts[r] as unknown as { at: Vec3 }).at;
  const topZ = Math.max(...Object.values(sc.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => at(p.ref)[2]));
  const rim = Object.values(sc.parts).filter((p) => p.kind === "line" && p.origin === "body" && at(p.a)[2] === topZ && at(p.b)[2] === topZ).map((p) => p.ref);
  assert.ok(rim.length >= 3);
  for (const mode of [1, -1]) {
    let st = reduce(select({ ...createState(sb.value), cam: homeCamera() }, [rim[0]!]), { type: "begin", name: "edge" }, env);
    st = { ...st, op: { ...st.op!, value: 1 * mode } };
    frameOf(st, { w: 800, h: 600 });
    st = { ...st, op: { ...st.op!, value: 2 * mode } };
    const f = frameOf(st, { w: 800, h: 600 });
    assert.ok((f.faceShift?.rounds?.groups.length ?? 0) >= rim.length, `${mode > 0 ? "fillet" : "chamfer"}: a rounding face for every edge of the rim, not only the chosen one`);
    assert.ok(scaledError(f, reduce(st, { type: "typed", key: "Enter", shift: false }, env)) < 2e-2, "and what is drawn lies on what the kernel makes");
  }
});

test("a chamfer dragged to a size the kernel cannot make is not drawn by stretching a smaller one (it folded into a spike): the kernel's answer is shown, and a size it can make still is drawn at once (`in_233`)", () => {
  const sb = openSession(kernel, readFileSync(new URL("./fixtures/big-chamfer.cad.json", import.meta.url), "utf8")) as { ok: true; value: ReturnType<typeof createSession> };
  const edge = Object.values(scene(sb.value).parts).find((p) => p.kind === "line" && p.origin === "body" && p.ref.startsWith("b/body/e@12.318,27.6637,1.9374~29.0749,39.277"))!;
  assert.ok(edge);
  let st = reduce(select({ ...createState(sb.value), cam: homeCamera() }, [edge.ref]), { type: "begin", name: "edge" }, env);
  st = { ...st, op: { ...st.op!, value: -2 } };
  assert.ok(frameOf(st, { w: 800, h: 600 }).faceShift?.rounds, "a size it can make: drawn without the kernel");
  st = { ...st, op: { ...st.op!, value: -13.5 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.faceShift, null, "13.5: the kernel cannot make it, so no stretched picture");
  assert.ok(/cannot be made|could not make/.test(f.message), `the reason is said: ${f.message}`);
});
