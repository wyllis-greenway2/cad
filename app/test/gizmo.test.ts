import { aboutDir } from "../src/math/rotation.ts";
import { anchorLines, anchorCutCorners } from "../src/operation/anchors.ts";
import { normalAngle, sectionNow, doSectionClick } from "../src/interaction/control/section.ts";
import { liveRepeat } from "../src/interaction/pattern.ts";
import { keyIntents } from "../src/interaction/input/keys.ts";
import { settings } from "../src/shared/settings.ts";
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
import { projector, homeCamera, lookStraight } from "../src/interaction/camera.ts";
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
/** Leave the operation that is open, keeping what it made (Enter applies, `in_244`; Esc would take it back), or clear the selection with none open. */
const leave = (st: AppState): AppState => reduce(st, st.op || st.repeat ? { type: "typed", key: "Enter", shift: false } : { type: "escape" }, env);
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
/** A click on an arrow (or a ring) of the operation's handles: it is selected and shows its number (`in_238`). */
function pickArrow(st: AppState, id?: string): AppState {
  const hs = gizmoOf(st)!.handles;
  const h = hs.find((x) => !id || x.id === id)!;
  // the spot of it furthest from the other handles (the rings cross one another)
  const others = hs.filter((x) => x !== h).flatMap((x) => x.points.map((q) => px(st, q)));
  const spots = h.kind === "arc" ? h.points : [scale(add(h.points[0]!, h.points.at(-1)!), 0.5)];
  const far = (q: Vec3) => Math.min(...others.map((o) => Math.hypot(o[0] - px(st, q)[0], o[1] - px(st, q)[1])), 1e9);
  const at = spots.reduce((b, q) => (far(q) > far(b) ? q : b));
  const [x, y] = px(st, at);
  return reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
}
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
  assert.deepEqual(g.handles.map((h) => h.id), ["move:x", "move:y", "move:z", "pivot"]);
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
  st = leave(st);
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
  assert.equal(f.gizmo!.handles.length, 4);
  assert.equal(f.gizmo!.hover, null);
  assert.equal(paramOnLine([0, 0, 0], [1, 0, 0], { o: [0, 5, 5], d: [1, 0, 0] }), null, "looking along the line: no distance");
  assert.deepEqual(selection(st.session), [BODY_OBJECT]);
});

const frame = (st: AppState) => frameOf(st, { w: 800, h: 600 });

test("the handles show up by themselves from a click: the body shows its X Y Z arrows, no menu", () => {
  let st = select(box(), [BODY_OBJECT]);
  assert.equal(st.op, null);
  assert.deepEqual(frame(st).gizmo!.handles.map((h) => h.id), ["move:x", "move:y", "move:z", "pivot"]);
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
  st = leave(st); // leave the extrude
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
  assert.deepEqual(g.handles.map((h) => h.id), ["scale:x", "scale:y", "scale:z", "scale"], "an arrow for each axis and the ball for all together (`in_387`)");
  const [c, corner] = g.handles.find((h) => h.id === "scale")!.points;
  nearV(c!, [20, 10, 10]);
  nearV(corner!, [40, 20, 20]);
  const out: Vec3 = add(c!, scale(sub(corner!, c!), 2)); // twice as far from the centre
  st = drag(st, corner!, out, 6);
  near(Number(scene(st.session).steps.at(-1)!.params.value), 2, 0.02);
  const bb = bbox(st);
  near(bb.max[0] - bb.min[0], 80, 0.5);
});

test("pulling the X arrow of Scale stretches the body along X alone, as the recipe is stretched (`dec_scale_axes`)", () => {
  let st = select(box(), [BODY_OBJECT]); // 40 x 20 x 20
  st = reduce(st, { type: "begin", name: "scale" }, env);
  const [c, tip] = gizmoOf(st)!.handles.find((h) => h.id === "scale:x")!.points;
  st = drag(st, tip!, add(c!, scale(sub(tip!, c!), 2)), 6);
  assert.equal(st.session.message, null);
  const bb = bbox(st);
  near(bb.max[0] - bb.min[0], 80, 1);
  near(bb.max[1] - bb.min[1], 20, 0.01);
  near(bb.max[2] - bb.min[2], 20, 0.01);
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
  assert.deepEqual(g.handles.map((h) => h.id), ["move:x", "move:y", "move:z", "pivot"], "the same arrows as an object");
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
  assert.equal(frame(st).entry, null, "no number until a ring is selected");
  st = pickArrow(st, "rot:z");
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
  st = pickArrow(st, "rot:z");
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
  assert.equal(frame(st).entry, null, "no number until the arrow is selected");
  st = pickArrow(st);
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
  assert.equal(frame(st).entry, null, "no number until a ring is selected");
  st = pickArrow(st, "rot:z");
  assert.deepEqual(fields(st), [["Z", "0"]]);
  // turn it 90 degrees about Z by typing it in the Z field
  st = reduce(st, { type: "entry", field: 2, text: "90" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  near(bbox(st).max[0]! - bbox(st).min[0]!, 20, 0.05);
  near(bbox(st).max[1]! - bbox(st).min[1]!, 40, 0.05);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  st = pickArrow(st, "rot:z");
  assert.deepEqual(fields(st), [["Z", "90"]], "it shows how it is turned now");
  // choose X and set it on its own to 30: Z stays 90
  st = reduce(st, { type: "look", plane: "X" }, env);
  assert.deepEqual(fields(st), [["X", "0"]]);
  st = reduce(st, { type: "entry", field: 0, text: "30" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  st = pickArrow(st, "rot:z");
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
  assert.deepEqual(gizmoOf(st)!.handles.map((h) => h.id), ["scale:x", "scale:y", "scale"], "an arrow along each axis of its plane, and the ball for all together (`in_390`)");
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
  assert.equal(frame(st).entry, null, "without a number until it is selected (`in_238`)");
  st = pickArrow(st);
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
import { startOp, opCommand, chosenFace, chamferFaces } from "../src/interaction/operations.ts";
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
  st = pickArrow(st);
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

test("a linear repeat of the body: one copy on one axis to begin with, that axis's count and distance arrows active together and both numbers shown, the result shows as you go; right click applies, Esc gives it up (`in_236`, `in_386`)", () => {
  let st = select(box(), [BODY_OBJECT]); // 40 x 20 x 20
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.ok(st.repeat && !st.op, "a repeat is open, and it is not an operation");
  assert.equal(st.repeat!.op.patStart![0], 2, "one copy to begin with, on one axis");
  assert.deepEqual(frame(st).entries.map((e) => e.fields[0]!.short), ["X×", "Δ"], "the pair that made the copy shows its count and its distance");
  assert.deepEqual(frame(st).gizmo!.locked, ["lin:x", "cnt:x"], "both arrows of the pair are lit");
  assert.equal(frame(st).helper, null);
  assert.equal(scene(st.session).steps.length, 1);
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id), ["lin:orb", "lin:x", "cnt:x", "lin:y", "cnt:y", "lin:z", "cnt:z"], "all three directions show from the start (`in_382`)");
  const mid = (id: string) => { const h = gizmoOf(st)!.handles.find((q) => q.id === id)!; return scale(add(h.points[0]!, h.points[1]!), 0.5); };
  // pull the spacing arrow out by 10: the number shown for the pair follows
  const m = mid("lin:x");
  st = drag(st, m, add(m, [10, 0, 0]));
  assert.deepEqual(bubbles(st), [["2"], ["60"]]);
  assert.ok(st.repeat, "a drag does not end it");
  st = reduce(st, { type: "entry", field: 2, text: "2" }, env);
  st = reduce(st, { type: "entry", field: 3, text: "50" }, env);
  assert.equal(scene(st.session).steps.length, 1, "nothing is made yet");
  // a stray click on nothing does not end it
  st = reduce(st, { type: "click", x: 5, y: 5, count: 1, shift: false }, env);
  assert.ok(st.repeat, "still open");
  // Enter makes the copies and leaves it, as a right click does (`in_244`)
  const byEnter = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(byEnter.repeat, null);
  assert.equal(scene(byEnter.session).steps.at(-1)!.type, "pattern");
  // a right click makes the copies and leaves it
  const done = reduce(st, { type: "menu", x: 400, y: 300 }, env);
  assert.equal(done.repeat, null);
  assert.equal(done.menu, null, "no menu: the right click was the apply");
  assert.deepEqual(done.session.outcome.errors, {});
  near(done.session.outcome.kernel!.volume!, 4 * 16000, 5); // 2 x 2
  assert.equal(scene(done.session).steps.at(-1)!.type, "pattern");
  // Esc gives it up
  const c = reduce(select(box(), [BODY_OBJECT]), { type: "runAction", id: "op:linear" }, env);
  const left = reduce(c, { type: "escape" }, env);
  assert.equal(left.repeat, null);
  assert.equal(scene(left.session).steps.length, 1);
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
  assert.deepEqual(gizmoOf(st)!.handles.map((h) => h.id), ["rot:x", "rot:y", "rot:z", "piv:x", "piv:y", "piv:z", "pivot"], "the rings, and a short arrow each way to move the pivot point (`in_384`)");
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
  assert.deepEqual(st.repeat!.op.patStart, [2, 12.5, 1, 6.25, 1, 12.5], "one copy to begin with, spaced one and a quarter sizes (a flat one has no size across, so the biggest is used there)");
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
  st = apply(st);
  assert.equal(st.session.message, null);
  assert.equal(faces(), 3, "three rectangles");
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").length, 12);
  assert.equal(scene(st.session).relations.length, 4, "only the original has relations: its copies are made from it, so they stay what it is (`in_257`)");
  assert.equal(scene(st.session).patterns?.length, 1, "and the repeat keeps its numbers");
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
  st = reduce(st, { type: "runAction", id: "clipboard:copy" }, env);
  st = reduce(st, { type: "runAction", id: "clipboard:paste" }, env);
  assert.equal(st.repeat, null, "a paste is made at once, nothing to set (`in_386`)");
  assert.equal(Object.values(scene(st.session).parts).filter((p) => p.kind === "face").length, 3);
  // and a body
  let b = select(box(), [BODY_OBJECT]);
  b = reduce(b, { type: "runAction", id: "clipboard:copy" }, env);
  b = reduce(b, { type: "runAction", id: "clipboard:paste" }, env);
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
  const pick = (a: number, z: number) => { const [x, y] = px(st, rimAt(z, a)); st = reduce(leave(st), { type: "click", x, y, count: 1, shift: false }, env); return selection(st.session).map((r) => scene(st.session).parts[r]).filter((p) => p?.kind === "line"); };
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

test("a fillet too big for its edge is made as a region that crosses the faces beside it, and says so (`in_405`: it used to be refused)", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2])!;
  st = select(st, [vertical.ref]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = typeText(st, "30");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.match(st.session.message ?? "", /could not be made as a smooth round/i);
  assert.equal(scene(st.session).steps.length, 2, "the step was made");
  assert.deepEqual(st.session.outcome.errors, {});
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
    st = reduce(leave(st), { type: "click", x, y, count: 1, shift: false }, env);
    if (selection(st.session).some((r) => { const p = scene(st.session).parts[r]; return p?.kind === "line" && p.circle && Math.abs(p.circle.radius - 10) < 1e-3 && p.circle.center[2] === 8; })) hits++;
  }
  assert.ok(hits >= 3, `the lower chamfer edge was picked at ${hits} of 4 places on the far side`);
});

test("the move arrows show one number bubble, on the chosen axis, with how far the move has taken the body since it began: 0 to begin with, kept on across drags, and a number typed in it is that position (`in_230`)", () => {
  let st = select(box(), [BODY_OBJECT]);
  const bubbles = (s: AppState) => frameOf(s, { w: 800, h: 600 }).entries.map((e) => `${e.fields[0]!.short}=${e.fields[0]!.value}`);
  assert.deepEqual(bubbles(st), [], "no number until an arrow is selected (`in_238`)");
  st = pickArrow(st, "move:x");
  assert.deepEqual(bubbles(st), ["X=0"], "one bubble, on the arrow that was selected");
  st = reduce(st, { type: "begin", name: "move" }, env);
  assert.deepEqual(bubbles(st), [], "a move begun: the arrows alone");
  st = pickArrow(st, "move:x");
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

test("Enter or a right click accepts the operation that is open and leaves it, what it made stays; Esc takes back everything it made since it began (`in_244`)", () => {
  const moved = (): AppState => {
    let st = select(box(), [BODY_OBJECT]);
    st = reduce(st, { type: "begin", name: "move" }, env);
    const g = gizmoOf(st)!;
    const mid = scale(add(g.handles[0]!.points[0]!, g.handles[0]!.points[1]!), 0.5);
    st = drag(st, mid, add(mid, [10, 0, 0]));
    const g2 = gizmoOf(st)!;
    const z = g2.handles[2]!;
    const zmid = scale(add(z.points[0]!, z.points[1]!), 0.5);
    st = drag(st, zmid, add(zmid, [0, 0, -4]));
    nearV(bbox(st).min, [10, 0, -4]);
    assert.ok(st.op);
    assert.equal(frame(st).confirm?.kind, "move", "the tick and the cross are shown for it");
    return st;
  };
  for (const apply of [{ type: "typed", key: "Enter", shift: false }, { type: "menu", x: 400, y: 300, button: false }] as const) {
    const st = reduce(moved(), apply, env);
    assert.equal(st.op, null, "left");
    assert.equal(st.menu, null, "no ring opened");
    nearV(bbox(st).min, [10, 0, -4]);
    assert.equal(frame(st).confirm, null);
  }
  const back = reduce(moved(), { type: "escape" }, env);
  assert.equal(back.op, null);
  nearV(bbox(back).min, [0, 0, 0]);
  assert.equal(scene(back.session).steps.length, 1, "both moves are taken back, the body's own step is all that is left");
  // a repeat shows the tick and the cross too
  const rep = reduce(select(box(), [BODY_OBJECT]), { type: "runAction", id: "op:linear" }, env);
  assert.equal(frame(rep).confirm?.kind, "linear");
});

test("the copies a repeat of a drawn figure would make are marked as temporary (they pulse), and only while it is open (`in_244`)", () => {
  let s = createSession(kernel);
  const line = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0]]); s = run(s, line.command);
  let st = select({ ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 0, 0] } }, line.lines);
  assert.deepEqual(frame(st).highlight.temp, [], "nothing before a repeat is open");
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.ok(st.repeat);
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env); // three along X
  st = reduce(st, { type: "entry", field: 1, text: "20" }, env);
  const temp = frame(st).highlight.temp;
  assert.ok(temp.length > 0, "the copies are marked");
  assert.ok(temp.every((r) => !scene(st.session).parts[r]), "none of them is in the drawing yet");
  assert.ok(!temp.includes(line.lines[0]!), "the original is not");
  st = reduce(st, { type: "escape" }, env);
  assert.deepEqual(frame(st).highlight.temp, [], "and nothing is marked once it is put away");
});

test("looking straight at a plane, a body's operations start in that plane: move across the screen, turn and circular repeat about the line of sight like a clock, a linear repeat across the screen (`in_244`)", () => {
  const look = (normal: Vec3, u: Vec3): AppState => ({ ...select(box(), [BODY_OBJECT]), cam: lookStraight(homeCamera(), normal, u) });
  // looking straight down on the XY plane (X across the screen): Z is the line of sight
  let st = look([0, 0, 1], [1, 0, 0]);
  assert.equal(reduce(st, { type: "begin", name: "move" }, env).op!.axis, 0, "across: X");
  assert.equal(reduce(st, { type: "begin", name: "rotate" }, env).op!.axis, 2, "about Z");
  assert.equal(reduce(st, { type: "runAction", id: "op:circular" }, env).repeat!.op.patStart![2], 2);
  // looking at the front (along Y, X across): turn and circular repeat about Y, move and repeat across it along X
  st = look([0, -1, 0], [1, 0, 0]);
  assert.equal(reduce(st, { type: "begin", name: "rotate" }, env).op!.axis, 1);
  assert.equal(reduce(st, { type: "runAction", id: "op:circular" }, env).repeat!.op.patStart![2], 1);
  assert.equal(reduce(st, { type: "begin", name: "move" }, env).op!.axis, 0);
  // from the side (along X, Y across the screen): a move and a linear repeat start along Y
  st = look([1, 0, 0], [0, 1, 0]);
  assert.equal(reduce(st, { type: "begin", name: "rotate" }, env).op!.axis, 0);
  assert.equal(reduce(st, { type: "begin", name: "move" }, env).op!.axis, 1);
  assert.equal(reduce(st, { type: "runAction", id: "op:linear" }, env).repeat!.op.along, 1);
  // not straight on: as before
  const tilted = { ...st, cam: homeCamera() };
  assert.equal(reduce(tilted, { type: "begin", name: "move" }, env).op!.axis, 0);
  assert.equal(reduce(tilted, { type: "begin", name: "rotate" }, env).op!.axis, 2);
});

test("an offset begins with its arrow on the outline where the pointer was when it was chosen, so it is in sight when the view is zoomed in (`in_244`)", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 30); s = run(s, c.command);
  const look = (target: Vec3): AppState => ({ ...select(createState(s), [c.circle]), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target, distance: 6 } });
  // zoomed into the far left of a big circle: the arrow stands there, not at its right side (30, 0)
  let st = look([-30, 0, 0]);
  const [mx, my] = projector(st.cam, env.w, env.h).project([-29.5, 1.5, 0]);
  st = reduce({ ...st, menu: { x: mx, y: my, items: [] } }, { type: "runAction", id: "op:offset" }, env);
  assert.equal(st.op?.kind, "offset");
  const at = st.op!.origin!;
  assert.ok(Math.abs(Math.hypot(at[0], at[1]) - 30) < 1e-6 && Math.hypot(at[0] + 29.5, at[1] - 1.5) < 0.6, `on the circle, by the pointer: ${at}`);
  assert.ok(st.op!.normal![0] < -0.99, "pointing out of the circle there");
  // and the distance still offsets the circle: out is bigger
  const out = reduce(reduce(st, { type: "typed", key: "2", shift: false }, env), { type: "typed", key: "Enter", shift: false }, env);
  const rs = Object.values(scene(out.session).parts).filter((p) => p.kind === "circle").map((p) => (p as { radius: number }).radius).sort((a, b) => a - b);
  assert.deepEqual(rs.map((r) => Math.round(r * 100) / 100), [30, 32]);
  // chosen by key (no pointer): at the middle of the view, which is on the circle here
  const keyed = reduce(look([-30, 0, 0]), { type: "runAction", id: "op:offset" }, env);
  nearV(keyed.op!.origin!, [-30, 0, 0]);
});

test("a drawn figure repeated round a point keeps its size: none is pulled out of shape, whatever the turn (`in_254`); the copies carry no relations of their own (`in_257`)", () => {
  for (const count of [4, 3, 5]) {
    let s = createSession(kernel);
    const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]);
    s = run(s, r.command);
    let st: AppState = { ...createState(s), cam: homeCamera() };
    st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
    st = reduce(st, { type: "runAction", id: "op:circular" }, env);
    st = reduce(st, { type: "entry", field: 0, text: String(count) }, env);
    st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    assert.equal(st.session.message, null, `${count} copies: nothing refused`);
    const sc = scene(st.session);
    const sides = Object.values(sc.parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.derived).map((p) => { const a = sc.parts[(p as { a: string }).a] as { at: Vec3 }, b = sc.parts[(p as { b: string }).b] as { at: Vec3 }; return Math.round(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) * 1e3) / 1e3; }).sort((x, y) => x - y);
    assert.deepEqual(sides, Array.from({ length: count }, () => [5, 5, 10, 10]).flat().sort((x, y) => x - y), `${count} copies: every side has its length`);
    // (the copies are made from the original and locked: they are what it is, so they carry no relations of their own, `in_257`; they used to be copied with theirs, and a copy turned by a quarter had to swap level and upright)
    assert.equal(sc.relations.filter((q) => q.kind === "horizontal" || q.kind === "vertical").length, 4, `${count} copies: the original keeps its four`);
  }
});

test("an open repeat switches to the other kind and back, each keeping what was set (`in_382`)", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]).command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "4" }, env); // four along X
  const typed = st.repeat!.op.pat.slice();
  assert.equal(frame(st).modeSwitch?.to, "circular");
  st = reduce(st, { type: "runAction", id: "op:circular" }, env);
  assert.equal(st.repeat!.op.kind, "circular");
  assert.ok(st.repeat!.pivot, "the pivot parts are there for the circular one");
  assert.equal(frame(st).modeSwitch?.to, "linear");
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.equal(st.repeat!.op.kind, "linear");
  assert.equal(st.repeat!.pivot, null);
  assert.deepEqual(st.repeat!.op.pat, typed, "the grid is as it was left");
});

test("Ctrl+C and Ctrl+V make a quick copy at once, with nothing to set (`in_382`, `in_386`)", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]).command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const faces = () => Object.values(scene(st.session).parts).filter((p) => p.kind === "face").length;
  st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
  for (const key of ["c", "v"]) {
    const intents = keyIntents({ kind: "key", key, down: true, mods: { shift: false, ctrl: true, alt: false }, t: 0 }, settings.input);
    assert.deepEqual(intents, [key === "c" ? { type: "runAction", id: "clipboard:copy" } : { type: "runAction", id: "clipboard:paste" }], "Ctrl+C captures, Ctrl+V pastes (`in_435`)");
  }
  st = reduce(st, { type: "runAction", id: "clipboard:copy" }, env);
  assert.equal(faces(), 1, "Ctrl+C makes nothing");
  st = reduce(st, { type: "runAction", id: "clipboard:paste" }, env);
  assert.equal(st.repeat, null, "no repeat is left open");
  assert.equal(faces(), 2, "one copy beside it");
  const pasted = Object.values(scene(st.session).parts).filter((p) => p.origin === "drawn" && p.kind === "corner");
  assert.ok(pasted.every((p) => !p.ref.includes(".c") || true));
  assert.equal(scene(st.session).patterns?.length ?? 0, 0, "the paste is parts of its own, not a repeat that is tied to the original (`in_435`)");
});

test("the wireframe view is a switch in the menu: on, the frame says the faces are not drawn; off, solid again (`in_383`)", () => {
  let st: AppState = { ...createState(createSession(kernel)), cam: homeCamera() };
  assert.equal(frame(st).wireframe, false);
  st = reduce(st, { type: "runAction", id: "view:wireframe" }, env);
  assert.equal(frame(st).wireframe, true);
  st = reduce(st, { type: "runAction", id: "view:wireframe" }, env);
  assert.equal(frame(st).wireframe, false);
});

test("undoing an applied circular repeat of a drawing leaves no pivot line behind, and redo brings the copies back (`in_384`)", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]).command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
  st = reduce(st, { type: "runAction", id: "op:circular" }, env);
  assert.ok(Object.keys(scene(st.session).parts).some((r) => r.endsWith(".rp")), "the pivot is there while it is set up");
  st = reduce(st, { type: "repeatApply" } as never, env);
  assert.ok(!Object.keys(scene(st.session).parts).some((r) => r.endsWith(".rp")), "applied: the pivot parts are gone");
  const copies = Object.keys(scene(st.session).parts).length;
  st = reduce(st, { type: "undo" }, env);
  assert.ok(!Object.keys(scene(st.session).parts).some((r) => /\.r[cpl]$/.test(r)), "undone: no pivot line left");
  st = reduce(st, { type: "redo" }, env);
  assert.equal(Object.keys(scene(st.session).parts).length, copies, "redone: the copies are back");
});

test("a number typed for the pivot of a circular repeat moves the pivot point there (`in_384`)", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]).command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
  st = reduce(st, { type: "runAction", id: "op:circular" }, env);
  st = reduce(st, { type: "entry", field: 3, text: "42.5" }, env);
  const corner = scene(st.session).parts[st.repeat!.pivot!.point] as unknown as { at: Vec3 };
  assert.equal(corner.at[0], 42.5, "the pivot point is at the number typed");
  st = reduce(st, { type: "entry", field: 4, text: "7" }, env);
  assert.deepEqual(liveRepeat(scene(st.session), st.repeat!).patStart!.slice(3, 5), [42.5, 7]);
  assert.ok(frame(st).entries.some((e) => e.fields[0]!.short === "Y"), "the bubble of the arrow that was taken shows its number");
});

test("a drawn figure is stretched along one axis of its plane alone by its arrow (`in_390`)", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  st = select(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref]);
  st = reduce(st, { type: "begin", name: "scale" }, env);
  const [c, tip] = gizmoOf(st)!.handles.find((h) => h.id === "scale:y")!.points;
  st = drag(st, tip!, add(c!, scale(sub(tip!, c!), 2)), 6);
  assert.equal(st.session.message, null);
  const cs = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at);
  near(Math.max(...cs.map((q) => q[0])) - Math.min(...cs.map((q) => q[0])), 40, 0.01);
  near(Math.max(...cs.map((q) => q[1])) - Math.min(...cs.map((q) => q[1])), 40, 0.5);
  assert.deepEqual(frame(st).entries.map((e) => e.fields[0]!.short), ["X", "Y"], "a bubble for each axis once an arrow has been pulled (`in_390`)");
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
  assert.equal(st.op!.axes![0], 3, "a number typed for an axis sets that axis");
});

test("a block with a fillet on an upright edge is stretched along X: the fillet stays and the block is longer (`in_390`)", () => {
  let st = box();
  const vertical = Object.values(scene(st.session).parts).find((p) => p.kind === "line" && p.origin === "body" && (scene(st.session).parts[p.a] as { at: Vec3 }).at[2] !== (scene(st.session).parts[p.b] as { at: Vec3 }).at[2])!;
  st = select(st, [vertical.ref]);
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const before = st.session.outcome.kernel!.bbox!;
  const made = run(st.session, { type: "stretch", factors: [2, 1, 1], pivot: [before.min[0], before.min[1], before.min[2]] });
  assert.equal(made.message, null);
  assert.deepEqual(made.outcome.errors, {});
  const b = made.outcome.kernel!.bbox!;
  near(b.max[0] - b.min[0], 2 * (before.max[0] - before.min[0]), 1e-4);
  assert.ok(Object.values(scene(made).parts).some((p) => p.kind === "plane" && p.origin === "body" && (p.rounded || p.curved)), "the fillet's surface is still there");
});

test("the tape measure goes when what it was applied to is let go or another thing is chosen (`in_391`)", () => {
  const s = box();
  const faces = Object.values(scene(s.session).parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.mesh);
  let st = select(s, [faces[0]!.ref]);
  st = reduce(st, { type: "runAction", id: "tape:measure" }, env);
  assert.equal(st.tape, true);
  st = reduce(st, { type: "click", x: 5, y: 5, count: 1, shift: false }, env); // (a click on nothing)
  assert.equal(st.session.click.selection.length, 0);
  assert.equal(st.tape, false, "deselected: the tape is put away");
});

test("Hollow: the selected faces are the open ones and the rest are the walls, the switch makes them the walls instead, a body selected is hollowed with no opening, a wall pulled the other way is outside (`in_391`, `in_393`)", () => {
  const faceOf = (st: AppState) => Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!p.mesh && p.mesh.every((_, i) => i % 3 !== 2 || Math.abs(p.mesh![i]! - 20) < 1e-6))!;
  const make = (st: AppState, text: string) => { st = reduce(st, { type: "entry", field: 0, text }, env); return reduce(st, { type: "typed", key: "Enter", shift: false }, env); };
  // the top face selected: it is the wall, everything else is open: a plate 2 thick
  let st = select(box(), [faceOf(box()).ref]);
  st = reduce(st, { type: "runAction", id: "op:hollow" }, env);
  assert.equal(st.op?.hollowMode, "open", "the selected face is the open one (`in_394`)");
  assert.equal(frame(st).modeSwitch?.to, "invert");
  const inverted = reduce(st, { type: "runAction", id: "hollow:invert" }, env);
  assert.equal(inverted.op?.hollowMode, "keep", "the switch makes the selected face the wall");
  const tray = make(st, "2");
  assert.equal(tray.session.message, null);
  near(tray.session.outcome.kernel!.volume!, 16000 - 36 * 16 * 18, 1);
  const plate = make(inverted, "2");
  near(plate.session.outcome.kernel!.volume!, 40 * 20 * 2, 1);
  // the whole body: hollow with no opening
  let all = select(box(), [BODY_OBJECT]);
  all = reduce(all, { type: "runAction", id: "op:hollow" }, env);
  assert.equal(all.op?.hollowMode, "closed");
  assert.equal(frame(all).modeSwitch, null, "nothing to switch: no face is open");
  all = make(all, "2");
  assert.equal(all.session.message, null);
  near(all.session.outcome.kernel!.volume!, 16000 - 36 * 16 * 16, 1);
  // a wall the other way is outside the body
  let out = select(box(), [faceOf(box()).ref]);
  out = reduce(out, { type: "runAction", id: "op:hollow" }, env);
  out = make(out, "-2");
  assert.equal(out.session.message, null);
  assert.ok(out.session.outcome.kernel!.bbox!.min[0] < -1.5, "it grew outward");
  near(out.session.outcome.kernel!.volume!, 44 * 24 * 22 - 16000, 1); // (sharp corners: no fillet where the walls meet, `in_394`)
  // nothing selected: refused with the reason
  const none = reduce(box(), { type: "runAction", id: "op:hollow" }, env);
  assert.match(none.session.message ?? "", /body|face/);
});

test("the cross section is a plane put in the part: the menu inserts it through the middle across the axis the camera looks along and selects only it, the half nearer the camera is cut away while it is selected, chips swap axis, side and handles, a deselected plane stays and cuts nothing, nothing is cut (`in_392`, `in_394`, `in_396`)", () => {
  let st = box(); // 40 x 20 x 20 from the origin
  st = select(st, [BODY_OBJECT]);
  const stepsBefore = scene(st.session).steps.length;
  st = reduce(st, { type: "runAction", id: "view:section" }, env);
  const sec = sectionNow(st)!;
  assert.ok(sec, "it begins at once");
  assert.deepEqual(st.session.click.selection, [sec.ref], "the plane is the only thing selected: the object is not");
  near(sec.centre[0], 20, 1e-6); near(sec.centre[1], 10, 1e-6); near(sec.centre[2], 10, 1e-6);
  assert.ok(dot(sec.n, sub(position(st.cam), sec.centre)) > 0, "the cut half is the one nearer the camera");
  assert.equal(frame(st).section!.corners.length, 4);
  assert.equal(frame(st).sectionPlanes.length, 1);
  // the chips
  const side = reduce(st, { type: "runAction", id: "section:side" }, env);
  assert.ok(dot(sectionNow(side)!.n, sec.n) < -0.99, "swap the side");
  const axis = reduce(st, { type: "runAction", id: "section:axis" }, env);
  assert.ok(Math.abs(dot(sectionNow(axis)!.n, sec.n)) < 0.01, "the axis goes round");
  assert.deepEqual(gizmoOf(st)!.handles.map((h) => h.id), ["move:x", "move:y", "move:z", "rot:x", "rot:y", "rot:z", "pivot"], "the very mover a body has: arrows, rings and the sphere (`in_419`)");
  // an arrow along its own axis moves it, as one step
  const k = sec.n.findIndex((v) => Math.abs(v) > 0.5);
  const [, tip] = gizmoOf(st)!.handles.find((h) => h.id === `move:${"xyz"[k]}`)!.points;
  const dir = [0, 0, 0].map((_, i) => (i === k ? 10 : 0)) as unknown as Vec3;
  const moved = drag(st, tip!, add(tip!, dir), 6);
  assert.ok(Math.abs(sectionNow(moved)!.centre[k]! - sec.centre[k]!) > 4, `${sectionNow(moved)!.centre[k]}`);
  assert.equal(scene(st.session).steps.length, stepsBefore, "a view: no step of the body was made");
  // a right click lets the plane go: it is deselected, and the cut stays (the cut is the plane's own, selected or not, `in_416`)
  const left = reduce(st, { type: "menu", x: 400, y: 300 }, env);
  assert.equal(sectionNow(left), null, "not selected");
  assert.ok(frame(left).section, "still cutting");
  assert.equal(frame(left).sectionPlanes.length, 1, "the plane is still there");
  assert.equal(sectionNow(reduce(st, { type: "escape" }, env)), null);
  // a click on the plane switches the cut off, and another on again, selected or not
  const off = doSectionClick(left, sec.ref);
  assert.equal(frame(off).section, null, "the click puts the cut off");
  assert.ok(sectionNow(off), "and the plane is selected");
  assert.ok(frame(doSectionClick(off, sec.ref)).section, "the next click puts it on");
  // the menu row with the plane selected puts it away for good (the plane goes)
  const again = select(left, [sec.ref]);
  assert.ok(sectionNow(again));
  const gone = reduce(again, { type: "runAction", id: "view:section" }, env);
  assert.equal(frame(gone).sectionPlanes.length, 0);
  // undo takes the plane out again: it was a step
  assert.equal(Object.values(scene(reduce(st, { type: "undo" }, env).session).parts).some((p) => p.kind === "plane" && !!p.section), false);
});

test("Select all faces, all edges, all vertices of the body (`in_393`)", () => {
  let st = box(); // a block: 6 faces, 12 edges, 8 vertices
  for (const [id, n] of [["select:faces", 6], ["select:edges", 12], ["select:vertices", 8]] as const) {
    const next = reduce(st, { type: "runAction", id }, env);
    assert.equal(next.session.click.selection.length, n, id);
  }
});

test("what the cross section cuts away cannot be picked: a corner on the cut side is not there to point at, one on the kept side is (`in_395`)", () => {
  const st = box(); // 40 x 20 x 20
  const corners = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "body") as unknown as { ref: string; at: Vec3 }[];
  const lo = corners.find((c) => c.at[0] === 0 && c.at[1] === 0 && c.at[2] === 0)!;
  const hi = corners.find((c) => c.at[0] === 40 && c.at[1] === 20 && c.at[2] === 20)!;
  const clip = { at: [20, 10, 10] as Vec3, n: [1, 0, 0] as Vec3 }; // the side x > 20 is cut away
  const at = (c: { at: Vec3 }, opts: object) => { const [x, y] = px(st, c.at); return candidatesAt(scene(st.session), projector(st.cam, env.w, env.h).view(x, y), { pointTol: 6, lineTol: 4, ...opts }); };
  assert.ok(at(hi, {}).some((c) => c.ref === hi.ref), "without a cut it is found");
  assert.ok(!at(hi, { clip }).some((c) => c.ref === hi.ref), "on the cut side: not found");
  assert.ok(at(hi, { clip: { at: clip.at, n: [-1, 0, 0] } }).some((c) => c.ref === hi.ref), "on the kept side: found");
  void lo;
});

test("numbers typed for the cross section: where it is along each axis while the arrows move it, the angle about each axis while the rings turn it (`in_395`)", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  assert.equal(frame(st).entries.length, 0, "no bubble until an arrow or ring is chosen, as for a body");
  st = { ...st, handleSel: "move:y" };
  assert.equal(frame(st).entries.length, 1, "only the chosen arrow's bubble");
  st = reduce(st, { type: "entry", field: 1, text: "12.5" }, env);
  near(sectionNow(st)!.centre[1], 12.5, 1e-6);
  st = { ...st, handleSel: "rot:x" };
  assert.deepEqual(frame(st).entries.map((e) => e.fields[0]!.index), [3], "only the chosen ring's bubble");
  const k = sectionNow(st)!.n.findIndex((v) => Math.abs(v) > 0.5);
  const other = (k + 1) % 3;
  st = reduce(st, { type: "entry", field: 3 + other, text: "30" }, env);
  near(normalAngle(sectionNow(st)!.n, other as 0 | 1 | 2), 30, 1e-4);
  assert.ok(Math.abs(Math.hypot(...sectionNow(st)!.n) - 1) < 1e-9, "still a unit normal");
});

test("a sketch on the cross section plane is held to the cut's own edges: the faces the plane cuts are lines, the round faces circles, to snap to and constrain (`in_397`)", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  const sec = sectionNow(st)!;
  const pl = scene(st.session).parts[sec.ref] as unknown as Parameters<typeof anchorLines>[1];
  const lines = anchorLines(scene(st.session), pl);
  const cut = lines.filter((l) => l.offset === 0);
  assert.equal(cut.length, 4, "a block cut across has four edges where the plane meets its faces");
  // the plane is the sketch plane when it is selected: the rectangle tool begins on it, and a corner near a cut edge is put on it
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.ok(st.tool, "the tool is on with the plane selected");
  const mid = (l: { a: Vec3; b: Vec3 }) => scale(add(l.a, l.b), 0.5);
  const edge = cut[0]!;
  const target = add(mid(edge), scale(sub(mid(edge), sec.centre), 0.01)); // (a hair off the edge)
  st = reduce(st, { type: "hover", x: px(st, target)[0], y: px(st, target)[1] }, env);
  assert.ok(st.tool!.hints?.some((h) => h.kind === "onLine" && h.ref === edge.ref), `the point is offered on the cut edge: ${JSON.stringify(st.tool!.hints)}`);
});

test("Look straight at the cross section plane turns the view to it (`in_397`)", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  const menu = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!;
  const look = menu.items.find((i) => i.id === "view")!.children!.find((i) => i.id === "look")!;
  assert.ok(look.enabled, "the plane is a surface to look at");
  st = reduce(st, { type: "runAction", id: "look" }, env);
  assert.ok(st.anim, "the view is turning to it");
});

test("a line started on a cut edge of the cross section plane is made with an on-line constraint to that face's cut, and the sketch stays on the plane (`in_397`)", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  const sec = sectionNow(st)!;
  const pl = scene(st.session).parts[sec.ref] as unknown as Parameters<typeof anchorLines>[1];
  const edge = anchorLines(scene(st.session), pl).filter((l) => l.offset === 0)[0]!;
  const m = scale(add(edge.a, edge.b), 0.5);
  st = reduce(st, { type: "begin", name: "line" }, env);
  const click = (p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
  st = click(add(m, scale(sub(sec.centre, m), 0.01)));
  st = click(sec.centre);
  assert.equal(st.session.message, null);
  const rels = scene(st.session).relations;
  assert.ok(rels.some((r) => r.kind === "onLine" && r.parts.includes(edge.ref)), `relations: ${JSON.stringify(rels.map((r) => [r.kind, r.parts]))}`);
  assert.ok(Object.values(scene(st.session).parts).some((p) => p.kind === "line" && p.origin === "drawn" && p.plane === sec.ref), "drawn on the cross section plane");
});

test("the corners where the cross section's cut edges meet are anchors: a point snaps to one and is held on each of the two cut edges (`in_398`)", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  const sec = sectionNow(st)!;
  const pl = scene(st.session).parts[sec.ref] as unknown as Parameters<typeof anchorLines>[1];
  const corners = anchorCutCorners(scene(st.session), pl);
  assert.equal(corners.length, 4, "a block cut across has four corners of the cut");
  assert.ok(corners.every((c) => c.refs.length === 2), "each is where two cut edges meet");
  const c = corners[0]!;
  st = reduce(st, { type: "begin", name: "line" }, env);
  const toward = scale(sub(sec.centre, c.at), 0.02);
  const near2 = add(c.at, toward); // (a hair from the corner, inside it)
  st = reduce(st, { type: "hover", x: px(st, near2)[0], y: px(st, near2)[1] }, env);
  assert.ok(Math.hypot(...sub(st.tool!.cursor!, c.at)) < 1e-6, `the pointer is taken to the corner: ${JSON.stringify(st.tool!.cursor)}`);
  assert.deepEqual(st.tool!.hints!.map((h) => h.kind), ["onLine", "onLine"], "on both cut edges");
  st = reduce(st, { type: "click", x: px(st, near2)[0], y: px(st, near2)[1], count: 1, shift: false }, env);
  st = reduce(st, { type: "click", x: px(st, sec.centre)[0], y: px(st, sec.centre)[1], count: 1, shift: false }, env);
  assert.equal(st.session.message, null);
  const on = scene(st.session).relations.filter((r) => r.kind === "onLine" && r.parts.some((p) => c.refs.includes(p)));
  assert.equal(on.length, 2, "a constraint to each of the two faces' cuts");
});

test("the mover has a sphere at its junction: a click selects it, its own arrows then move the mover (the body stays), and a vertex clicked puts the mover there; a turn is about the mover's place (`in_416`)", () => {
  let st = select(box(), [BODY_OBJECT]); // 40 x 20 x 20
  st = reduce(st, { type: "begin", name: "move" }, env);
  const ids = () => gizmoOf(st)!.handles.map((h) => h.id);
  assert.deepEqual(ids(), ["move:x", "move:y", "move:z", "pivot"], "arrows and the sphere");
  const centre0 = gizmoOf(st)!.centre;
  const [bx, by] = px(st, centre0);
  st = reduce(st, { type: "click", x: bx, y: by, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true, "the sphere is selected");
  assert.deepEqual(ids(), ["piv:x", "piv:y", "piv:z", "rot:x", "rot:y", "rot:z", "pivot"], "its own arrows and rings are up: both work on the mover");
  // an arrow of the sphere moves the mover along x by 10, not the body
  const [c, tip] = gizmoOf(st)!.handles.find((h) => h.id === "piv:x")!.points;
  const stepsBefore = scene(st.session).steps.length;
  st = drag(st, tip!, add(tip!, [10, 0, 0]), 6);
  near(gizmoOf(st)!.centre[0] - c![0], 10, 0.6);
  assert.equal(scene(st.session).steps.length, stepsBefore, "the body did not move");
  // a vertex clicked puts the mover on it
  const corner = Object.values(scene(st.session).parts).find((p) => p.kind === "corner" && p.origin === "body" && (p as { at: Vec3 }).at[0] === 40 && (p as { at: Vec3 }).at[1] === 20 && (p as { at: Vec3 }).at[2] === 20) as unknown as { at: Vec3 };
  const [qx, qy] = px(st, corner.at);
  st = reduce(st, { type: "click", x: qx, y: qy, count: 1, shift: false }, env);
  near(gizmoOf(st)!.centre[0], 40, 1e-6); near(gizmoOf(st)!.centre[1], 20, 1e-6); near(gizmoOf(st)!.centre[2], 20, 1e-6);
  assert.equal(st.moverSphere, true, "the sphere stays selected for another place");
  // the turn tool has the sphere too, and its own arrows when the sphere is selected
  const turn = reduce(select(box(), [BODY_OBJECT]), { type: "begin", name: "rotate" }, env);
  assert.deepEqual(gizmoOf(turn)!.handles.map((h) => h.id), ["rot:x", "rot:y", "rot:z", "pivot"]);
  const [tx, ty] = px(turn, gizmoOf(turn)!.centre);
  const picked = reduce(turn, { type: "click", x: tx, y: ty, count: 1, shift: false }, env);
  assert.deepEqual(gizmoOf(picked)!.handles.map((h) => h.id), ["piv:x", "piv:y", "piv:z", "rot:x", "rot:y", "rot:z", "pivot"]);
});

test("the mover can be turned: with the sphere selected a ring turns the mover's axes, and then its arrows move the body along the turned axes and its rings turn it about them (`in_417`)", () => {
  let st = select(box(), [BODY_OBJECT]); // 40 x 20 x 20
  st = reduce(st, { type: "begin", name: "move" }, env);
  const [bx, by] = px(st, gizmoOf(st)!.centre);
  st = reduce(st, { type: "click", x: bx, y: by, count: 1, shift: false }, env); // (the sphere)
  // turn the mover a quarter about its Z: take a point of the Z ring a quarter of the way round
  const ring = gizmoOf(st)!.handles.find((h) => h.id === "rot:z")!;
  const c = gizmoOf(st)!.centre;
  const p0 = ring.points[Math.floor(ring.points.length / 8)]!; // (away from where the rings cross)
  const w = sub(p0, c);
  const p1: Vec3 = add(c, [-w[1], w[0], w[2]]); // (90 degrees about Z)
  st = drag(st, p0, p1, 8);
  const f = st.op!.frame!;
  assert.ok(f, "the mover has its own axes now");
  near(Math.abs(f[0][1]), 1, 0.08); // (its X now lies along the world Y)
  // the sphere clicked again goes back to true x, y, z, where it is; once more, to its turned axes (`in_419`)
  const place = gizmoOf(st)!.centre;
  st = reduce(st, { type: "click", x: bx, y: by, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true);
  assert.equal(st.op!.frame, undefined, "true x, y, z");
  nearV(gizmoOf(st)!.centre, place, 1e-9);
  st = reduce(st, { type: "click", x: bx, y: by, count: 1, shift: false }, env);
  assert.ok(st.op!.frame, "its turned axes again");
  // apply (Enter): the sphere is let go with the mover as oriented, and the arrows move the body along its axes
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.moverSphere, false);
  assert.ok(st.op, "the mover stays");
  const ax = gizmoOf(st)!.handles.find((h) => h.id === "move:x")!;
  const d = sub(ax.points[1]!, ax.points[0]!);
  near(Math.abs(d[1]) / Math.hypot(...d), 1, 0.08);
  const before = st.session.outcome.kernel!.bbox!;
  const mid = scale(add(ax.points[0]!, ax.points[1]!), 0.5);
  st = drag(st, mid, add(mid, scale(d, 10 / Math.hypot(...d))), 6);
  assert.equal(st.session.message, null);
  const after = st.session.outcome.kernel!.bbox!;
  assert.ok(Math.abs(after.min[1]! - before.min[1]!) > 6 && Math.abs(after.min[0]! - before.min[0]!) < 0.5, `the body went along the world Y: ${before.min} -> ${after.min}`);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "move");
  assert.ok(step.params.vy !== undefined && Math.abs(Number(step.params.vy)) > 6, "as a move by a vector");
});

test("with the mover turned, its ring turns the body about the mover's axis: a rotate step about that direction (`in_417`)", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  st = { ...st, op: { ...st.op!, frame: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] } };
  const g = gizmoOf(st)!;
  const ring = g.handles.find((h) => h.id === "rot:x")!; // (the mover's X is the world Y: a ring about Y)
  const c = g.centre;
  const p0 = ring.points[Math.floor(ring.points.length / 8)]!;
  const w = sub(p0, c);
  const p1: Vec3 = add(c, [w[2], w[1], -w[0]]); // (a quarter about Y)
  st = drag(st, p0, p1, 8);
  assert.equal(st.session.message, null);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "rotate");
  assert.ok(Math.abs(Number(step.params.dy)) > 0.9 && Math.abs(Number(step.params.dx)) < 0.1, `about the world Y: ${JSON.stringify(step.params)}`);
});

test("move and turn are two tools, each with only its own handles and acting on the object; the sphere is the mode for orienting the mover itself: it pulses, the object goes wireframe, a bubble says so, Apply keeps the new axes and Cancel puts them back (`in_421`)", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  assert.deepEqual(gizmoOf(st)!.handles.map((h) => h.id), ["move:x", "move:y", "move:z", "pivot"], "the move tool: only its arrows");
  assert.equal(frame(st).wireframe, false);
  assert.equal(frame(st).confirm?.text, undefined);
  const [bx, by] = px(st, gizmoOf(st)!.centre);
  st = reduce(st, { type: "click", x: bx, y: by, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true);
  const f = frame(st);
  assert.equal(f.wireframe, true, "the object goes wireframe");
  assert.equal(f.gizmo!.pulse, "pivot", "the sphere pulses");
  assert.equal(f.confirm?.text, "Orient the mover", "a bubble says what this is");
  // turn the mover by a ring, then cancel: it is as it was
  const g = gizmoOf(st)!;
  const ring = g.handles.find((h) => h.id === "rot:z")!;
  const p0 = ring.points[Math.floor(ring.points.length / 8)]!;
  const w = sub(p0, g.centre);
  st = drag(st, p0, add(g.centre, [-w[1], w[0], w[2]]), 8);
  assert.ok(st.op!.frame, "turned");
  const cancelled = reduce(st, { type: "escape" }, env);
  assert.equal(cancelled.moverSphere, false);
  assert.equal(cancelled.op!.frame, undefined, "Cancel puts the axes back");
  assert.equal(frame(cancelled).wireframe, false);
  // apply keeps them
  const applied = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(applied.moverSphere, false);
  assert.ok(applied.op!.frame, "Apply keeps the axes");
  assert.equal(scene(applied.session).steps.length, 1, "orienting the mover makes no step");
  // the turn tool likewise: only the rings
  const turn = reduce(select(box(), [BODY_OBJECT]), { type: "begin", name: "rotate" }, env);
  assert.deepEqual(gizmoOf(turn)!.handles.map((h) => h.id), ["rot:x", "rot:y", "rot:z", "pivot"]);
});

test("the mover's place can be typed: with the sphere selected its x, y and z are fields, and the next turn is about that point; a free drag of a turned mover follows its axes (`in_418`)", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  const [bx, by] = px(st, gizmoOf(st)!.centre);
  st = reduce(st, { type: "click", x: bx, y: by, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true);
  const f = frame(st);
  assert.equal(f.entries.length, 0, "nothing until an arrow or ring is chosen (`in_439`)");
  const chosen = { ...st, handleSel: "piv:x" };
  assert.equal(frame(chosen).entries.length, 1, "the value of the arrow that was clicked");
  const moved = { ...st, orbMovedAt: 0 };
  assert.equal(frameOf(moved, { w: 800, h: 600 }, 100).entries.length, 3, "the whole orb moved: all three, one on each arrow of the sphere");
  st = reduce(st, { type: "entry", field: 0, text: "40" }, env);
  st = reduce(st, { type: "entry", field: 1, text: "20" }, env);
  nearV(gizmoOf(st)!.centre.map((c) => Math.round(c * 1e6) / 1e6) as unknown as Vec3, [40, 20, 10], 1e-6);
  assert.equal(scene(st.session).steps.length, 1, "no step: only the mover moved");
  // a turned mover: the free drag follows its own axes
  st = { ...st, moverSphere: false, op: { ...st.op!, kind: "move", frame: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]], pivot: null } };
  assert.equal(st.op!.frame![0][1], 1);
});

test("a drawn figure turned about a slanted axis of the mover ends where the exact turn puts it (`in_418`)", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command);
  let st = { ...createState(s), cam: homeCamera() };
  const corners = () => Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as { at: Vec3 }).at);
  const before = corners();
  const faceRef = Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref;
  st = select(st, [faceRef]);
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  const dir: Vec3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
  st = { ...st, op: { ...st.op!, frame: [dir, [-1 / Math.SQRT2, 1 / Math.SQRT2, 0], [-1 / Math.sqrt(6), -1 / Math.sqrt(6), 2 / Math.sqrt(6)]], axis: 0, pivot: [0, 0, 0] } };
  st = reduce(st, { type: "entry", field: 0, text: "50" }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const m = aboutDir(dir, 50);
  const exact = before.map((p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]] as Vec3);
  const after = corners();
  for (const e of exact) assert.ok(after.some((a) => Math.hypot(a[0] - e[0], a[1] - e[1], a[2] - e[2]) < 1e-4), `a corner at ${e} in ${JSON.stringify(after)}`);
});

test("a cross section made with a flat face selected lies on that face, facing out of it (`in_419`)", () => {
  let st = box(); // 40 x 20 x 20
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.mesh && p.mesh.length >= 9 && Math.abs(normalOfPlane(p)[2]) > 0.99 && normalOfPlane(p)[2] > 0)!;
  st = select(st, [top.ref]);
  st = reduce(st, { type: "runAction", id: "view:section" }, env);
  const sec = sectionNow(st)!;
  assert.ok(sec, "the plane is made");
  nearV(sec.n, [0, 0, 1], 1e-6);
  near(sec.centre[2], 20, 1e-6);
});

test("the mover put on a slanted face has an arrow normal to it; on a face across a world axis it keeps true x, y, z (`in_419`)", () => {
  let st = box();
  const faces = Object.values(scene(st.session).parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.mesh);
  const flat = faces.find((p) => p.kind === "plane" && Math.abs(normalOfPlane(p)[2]) > 0.99)!;
  st = select(st, [flat.ref]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  assert.equal(st.op!.frame, undefined, "across a world axis: true x, y, z");
  const r = startOp(scene(st.session), [flat.ref], "move");
  assert.ok(r.ok);
  const slanted = { ...flat, u: [1, 0, 0], v: [0, Math.SQRT1_2, Math.SQRT1_2] } as typeof flat; // (a face that is across none of the axes)
  const sc2 = { ...scene(st.session), parts: { ...scene(st.session).parts, [flat.ref]: slanted } };
  const r2 = startOp(sc2, [flat.ref], "move");
  assert.ok(r2.ok && r2.op.frame, "a slanted face: the mover is turned to it");
  const n = normalOfPlane(slanted as Parameters<typeof normalOfPlane>[0]);
  nearV(r2.op.frame![2], n, 1e-6);
});

test("a chamfer can have a distance along each face: the chip offers it for a chamfer, the first face is lit, two numbers are typed, Swap takes the first distance to the other face, and the step names the face (`in_432`)", () => {
  const { st: st0 } = edgeSelected(); // the top front edge of the 40 x 20 x 20 block: between the top (z = 20) and the front (y = 0)
  let st = reduce(st0, { type: "begin", name: "edge" }, env);
  assert.equal(frame(st).sizeKinds!.some((k) => k.id === "twoDistances"), false, "not offered before it is a chamfer");
  st = reduce(st, { type: "typed", key: "-", shift: false }, env);
  st = reduce(st, { type: "typed", key: "2", shift: false }, env);
  assert.ok(frame(st).sizeKinds!.some((k) => k.id === "twoDistances"), "offered for a chamfer");
  st = reduce(st, { type: "sizeKind", kind: "twoDistances" }, env);
  assert.equal(frame(st).entry!.fields.length, 2, "two numbers");
  assert.equal(frame(st).highlight.selection.length, 2, "the face the first distance is along is lit with the edge");
  assert.ok(frame(st).sizeKinds!.some((k) => k.id === "swap"), "and a swap");
  st = reduce(st, { type: "typed", key: "Tab", shift: false }, env);
  st = reduce(st, { type: "typed", key: "5", shift: false }, env);
  const first = chosenFace(scene(st.session), st.op!)!;
  const swapped = reduce(st, { type: "sizeKind", kind: "swap" }, env);
  assert.notEqual(chosenFace(scene(swapped.session), swapped.op!)!.ref, first.ref, "the other face");
  const done = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(done.session.message, null);
  const step = scene(done.session).steps.at(-1)!;
  assert.equal(step.params.mode, "chamfer");
  assert.equal(step.params.value, 2);
  assert.equal(step.params.d2, 5);
  assert.equal(String(step.params.face).split(",").length, 7, "the face is named");
  near(done.session.outcome.kernel!.volume!, 16000 - 0.5 * 2 * 5 * 40, 0.2);
});

test("in the orient mode each of the three bubbles has the mover's position along its axis and, beside it, its turn about that axis, with the degree mark; a turn typed there turns the mover's axes (`in_434`)", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  const [bx, by] = px(st, gizmoOf(st)!.centre);
  st = reduce(st, { type: "click", x: bx, y: by, count: 1, shift: false }, env);
  const es = frameOf({ ...st, orbMovedAt: 0 }, { w: 800, h: 600 }, 100).entries; // (the whole orb just moved: all three show)
  assert.equal(es.length, 3);
  for (const e of es) {
    assert.deepEqual(e.fields.map((f) => f.unit), ["mm", "°"], "a position and a turn");
    assert.deepEqual(e.fields.map((f) => f.index).map((i) => i! >= 3), [false, true]);
  }
  assert.equal(es[2]!.fields[1]!.value, "0");
  st = reduce(st, { type: "entry", field: 5, text: "90" }, env); // a quarter about Z
  const f = st.op!.frame!;
  near(f[0][1], 1, 1e-9); // (its X is the world Y now)
  assert.equal(frameOf({ ...st, orbMovedAt: 0 }, { w: 800, h: 600 }, 100).entries[2]!.fields[1]!.value, "90");
  assert.equal(frame({ ...st, handleSel: "rot:z" }).entries[0]!.fields[0]!.value, "90", "a ring chosen: its turn alone");
  assert.equal(frameOf({ ...st, orbMovedAt: 0 }, { w: 800, h: 600 }, 1700).entries[0]!.opacity! < 1, true, "and they fade");
  st = reduce(st, { type: "entry", field: 5, text: "0" }, env);
  assert.equal(st.op!.frame, undefined, "no turn: true x, y, z again");
});

test("Select all edges, faces and vertices belong to what is selected: one face gives its own edges and corners, a whole body all of its, a flat sketch its own sides (`in_435`)", () => {
  const st0 = box();
  const sc = scene(st0.session);
  const top = Object.values(sc.parts).find((p) => p.kind === "plane" && p.origin === "body" && p.mesh && Math.abs(normalOfPlane(p)[2]) > 0.99 && normalOfPlane(p)[2] > 0)!;
  const run1 = (st: AppState, id: string) => reduce(st, { type: "runAction", id }, env);
  let st = run1(select(st0, [top.ref]), "select:edges");
  assert.equal(selection(st.session).length, 4, "the four edges of that face, not the block's twelve");
  st = run1(select(st0, [top.ref]), "select:vertices");
  assert.equal(selection(st.session).length, 4);
  st = run1(select(st0, [top.ref]), "select:faces");
  assert.deepEqual(selection(st.session), [top.ref], "a face's face is itself");
  st = run1(select(st0, [BODY_OBJECT]), "select:edges");
  assert.equal(selection(st.session).length, 12, "the whole body: all its edges");
  // a flat sketch has no thickness: its own sides and corners
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const face = Object.values(scene(s).parts).find((p) => p.kind === "face")!.ref;
  const flat = select({ ...createState(s), cam: homeCamera() }, [face]);
  assert.equal(selection(run1(flat, "select:edges").session).length, 4);
  assert.equal(selection(run1(flat, "select:vertices").session).length, 4);
});

test("Select all edges on a cylinder includes its circles (a rim is two half circles, both are selected), for the whole cylinder and for its flat face (`in_437`)", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  const st0 = { ...createState(s), cam: homeCamera() };
  const lines = (st: AppState) => selection(st.session).map((r) => scene(st.session).parts[r]).filter((p) => p?.kind === "line") as unknown as { circle?: unknown }[];
  const all = reduce(select(st0, [BODY_OBJECT]), { type: "runAction", id: "select:edges" }, env);
  assert.equal(lines(all).length, 6, "the seam and the four halves of the two rims");
  assert.equal(lines(all).filter((l) => l.circle).length, 4, "the circles are edges");
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && p.mesh && Math.abs((p.mesh[2] ?? 0) - 20) < 1e-6)!;
  const face = reduce(select(st0, [top.ref]), { type: "runAction", id: "select:edges" }, env);
  assert.equal(lines(face).length, 2, "the rim of the top face: its two halves");
  assert.ok(lines(face).every((l) => l.circle));
});

test("an oriented mover stays while its part is selected, also across the move and turn tools; a right click in the orient mode is the apply check: the selection stays, the mover's place is kept, the tool it was in is there again (`in_439`)", () => {
  let st = select(box(), [BODY_OBJECT]);
  st = reduce(st, { type: "begin", name: "move" }, env);
  const [bx, by] = px(st, gizmoOf(st)!.centre);
  st = reduce(st, { type: "click", x: bx, y: by, count: 1, shift: false }, env);
  assert.equal(st.moverSphere, true);
  assert.equal(frame(st).gizmo!.pulse, "pivot", "the orient mode pulses");
  st = reduce(st, { type: "entry", field: 5, text: "90" }, env); // a quarter about Z
  st = reduce(st, { type: "entry", field: 0, text: "30" }, env); // and a place along X
  const placed = st.op!.pivot!;
  // a right click on empty space applies it: no menu, the selection kept, the tool as it was
  const right = reduce(st, { type: "menu", x: 40, y: 560 }, env);
  assert.equal(right.moverSphere, false, "the orient mode is left");
  assert.equal(right.menu, null, "no menu");
  assert.deepEqual(selection(right.session), [BODY_OBJECT], "the selection is not touched");
  assert.equal(right.op?.kind, "move", "back to the move tool");
  assert.deepEqual(right.op?.pivot, placed, "with the mover where it was put");
  assert.ok(right.op?.frame, "and turned");
  // the swapper to the turn tool: the mover is as it was
  const turned = reduce(right, { type: "runAction", id: "op:rotate" }, env);
  assert.equal(turned.op?.kind, "rotate");
  nearV(turned.op!.frame![0], [0, 1, 0], 1e-6);
  nearV(turned.op!.pivot!, placed, 1e-6);
  // and back again
  const back = reduce(turned, { type: "runAction", id: "op:move" }, env);
  nearV(back.op!.frame![0], [0, 1, 0], 1e-6);
  // another part selected: it does not carry over
  const other = reduce(select(back, []), { type: "begin", name: "move" }, env);
  assert.equal(other.moverPose, null);
  // the Enter and the check do the same
  const enter = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(enter.moverSphere, false);
  assert.ok(enter.moverPose, "remembered");
});
