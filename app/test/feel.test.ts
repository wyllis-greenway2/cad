// `in_193`: a straight (orthographic) view is a little hard to leave and leaves smoothly; the grid fades; extruding into a body cuts it.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce, advance } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { projector, lookStraight, homeCamera, basis } from "../src/interaction/camera.ts";
import { gridFor } from "../src/interaction/grid.ts";
import { drawRectangle, drawChain, drawCircle } from "../src/operation/build.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { settings } from "../src/shared/settings.ts";
import type { Plane } from "../src/operation/part.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };

test("a straight view holds on: small drags do nothing, a drag past the hold leaves it, and the view does not jump (what is at the target stays where it is)", () => {
  let st = { ...createState(createSession(kernel)), cam: lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]) };
  const b = basis(st.cam);
  const probe: Vec3 = [st.cam.target[0] + b.right[0] * 15, st.cam.target[1] + b.right[1] * 15, st.cam.target[2] + b.right[2] * 15]; // (a point on the target's plane)
  const where = (s: typeof st) => projector(s.cam, 800, 600).project(probe);
  const before = where(st);
  for (let k = 0; k < 5; k++) st = reduce(st, { type: "orbit", x: 400, y: 300, dx: 6, dy: 0 }, env); // 30 px: held
  assert.equal(st.cam.straight, true, "30 px is not enough");
  assert.deepEqual(where(st), before);
  st = reduce(st, { type: "orbit", x: 400, y: 300, dx: 40, dy: 0 }, env); // past the hold
  assert.equal(st.cam.straight, false, "it leaves");
  assert.ok(st.mixT0 !== null && st.cam.mix !== undefined && st.cam.mix < 0.1, "with almost no perspective at first");
  const after = where(st);
  assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) < 12, `no jump (${before} -> ${after})`);
  // the perspective comes in over the next moments
  let t = advance(st, 1000);
  const m1 = t.cam.mix!;
  t = advance(t, 1000 + settings.view.perspectiveMs / 2);
  assert.ok(t.cam.mix! > m1, "growing");
  t = advance(t, 1000 + settings.view.perspectiveMs + 1);
  assert.equal(t.cam.mix, undefined, "all in");
  assert.equal(t.mixT0, null);
  // the hold starts again after a drag ends and the view is straight again
  const again = reduce({ ...createState(createSession(kernel)), cam: lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]) }, { type: "orbit", x: 400, y: 300, dx: 20, dy: 0 }, env);
  assert.equal(again.cam.straight, true);
});

test("seen from the side the grid is a patch that fades towards its edge", () => {
  const xy = scene(createSession(kernel)).parts[XY] as Plane;
  const g = gridFor(homeCamera(), xy, 800, 600)!;
  assert.ok(g.fade && g.fade.radius > 0, "it says where the fade is about");
  assert.equal(gridFor(lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), xy, 800, 600)!.fade, undefined, "straight on it covers the view");
});

test("a second extrusion stays a new piece while it only touches or stands apart, and cuts the body as soon as it goes into it", () => {
  const first = () => {
    let s = createSession(kernel);
    const r = drawRectangle(scene(s), XY, [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]);
    s = run(s, r.command);
    return run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: r.lines, params: { depth: 10 } } });
  };
  const extrudeSquare = (s: ReturnType<typeof first>, a: Vec3, c: Vec3, plane: string, depth: number) => {
    const r = drawRectangle(scene(s), plane as never, a, c, [1, 0, 0], [0, 1, 0]);
    s = run(s, r.command);
    const face = Object.values(scene(s).parts).find((p) => p.kind === "face" && p.loop.length === 4 && p.loop.every((l) => r.lines.includes(l)))!;
    const st = startOp(scene(s), [face.ref], "extrude") as { ok: true; op: Parameters<typeof opCommand>[1] };
    return run(s, opCommand(scene(s), { ...st.op, value: depth })!);
  };
  // standing apart: a second piece
  const apart = extrudeSquare(first(), [40, 0, 0], [50, 10, 0], XY, 10);
  assert.ok(Math.abs(apart.outcome.kernel!.volume! - (4000 + 1000)) < 1);
  // overlapping the first on the same plane: it goes into the body, so it is a cut (the overlap of 10 x 20 x 10 is taken out)
  const into = extrudeSquare(first(), [10, 0, 0], [30, 20, 0], XY, 10);
  assert.ok(Math.abs(into.outcome.kernel!.volume! - (4000 - 2000)) < 1, `${into.outcome.kernel!.volume}`);
  // drawn on the top face and pulled up: it only touches, so it is added
  const top = first();
  const topFace = Object.values(scene(top).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded && p.at[2] === 10)!;
  const up = extrudeSquare(top, [5, 5, 10], [10, 10, 10], topFace.ref, 5);
  assert.ok(Math.abs(up.outcome.kernel!.volume! - (4000 + 125)) < 1, `${up.outcome.kernel!.volume}`);
  // the same drawing pulled down into the body: a pocket
  const down = extrudeSquare(first(), [5, 5, 10], [10, 10, 10], topFace.ref, -5);
  assert.ok(Math.abs(down.outcome.kernel!.volume! - (4000 - 125)) < 1, `${down.outcome.kernel!.volume}`);
});

test("sketching on a plane with a block between it and the camera: the block does not take the drawing, and goes see-through; in 3D it is all as it was (`in_194`)", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [5, 0, 0], [25, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: r.lines, params: { depth: 10 } } });
  let st = createState(s);
  st = reduce(st, { type: "look", plane: "X" }, env); // the YZ plane is selected and looked at straight, from +X: the block is between the camera and it
  st = advance({ ...st, anim: st.anim ? { ...st.anim, t0: -1e6 } : null }, 1e6);
  assert.equal(st.cam.straight, true);
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.equal(frameOf(st, { w: 800, h: 600 }).fadeBody, true, "the body is see-through");
  const [x, y] = projector(st.cam, 800, 600).project([0, 10, 5]);
  const clicked = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(clicked.tool!.plane, worldRef("YZ"), "the drawing is on the plane that was chosen, not on the face of the block in front of it");
  assert.ok(Math.abs(clicked.tool!.points[0]![0]) < 1e-6);
  // in 3D the body is as it was
  const free = reduce(clicked, { type: "orbit", x: 400, y: 300, dx: 200, dy: 100 }, env);
  assert.equal(frameOf(free, { w: 800, h: 600 }).fadeBody, false);
});

test("a closed sketch under a little pane near the origin is hovered, not the pane (the panes do not block drawings)", () => {
  let s = createSession(kernel);
  s = run(s, drawRectangle(scene(s), XY, [0, 0, 0], [30, 30, 0], [1, 0, 0], [0, 1, 0]).command);
  const st = createState(s);
  const [x, y] = projector(st.cam, 800, 600).project([6, 6, 0]); // (inside the XY pane, inside the rectangle)
  const hovered = reduce(st, { type: "hover", x, y }, env);
  assert.equal(hovered.paneHover, null);
  assert.match(hovered.session.hover ?? "", /^d\/loop@/, "the closed sketch is what the pointer is on");
});

test("the state snapshot has what is needed to see what the human sees, can be written as JSON, and its project opens again (`in_200`)", async () => {
  const { snapshotOf, logEntry } = await import("../src/interaction/snapshot.ts");
  const { openSession } = await import("../src/interaction/session.ts");
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: r.lines, params: { depth: 5 } } });
  let st = createState(s);
  st = reduce(st, { type: "zoom", factor: 0.8, x: 400, y: 300 }, env);
  const log = [logEntry({ type: "zoom", factor: 0.8, x: 400, y: 300 }, st, 12.34)];
  const snap = snapshotOf(st, { intents: log, viewport: { w: 800, h: 600, dpr: 2 }, device: "mouse", userAgent: "test", build: "x", scrollMode: "auto", at: "now", pointer: { x: 400, y: 300 } });
  const text = JSON.stringify(snap);
  const back = JSON.parse(text) as Record<string, unknown> & { camera: { distance: number }; kernel: { volume: number }; project: unknown; intents: { cam: unknown }[] };
  assert.ok(Math.abs(back.camera.distance - st.cam.distance) < 1e-3);
  assert.ok(Math.abs(back.kernel.volume - 1000) < 0.01);
  assert.ok(back.intents[0]!.cam, "a camera intent carries the camera after it");
  const reopened = openSession(kernel, JSON.stringify(back.project));
  assert.ok(reopened.ok, "the project in the snapshot opens again");
  for (const key of ["selection", "tool", "op", "world", "message", "kernel", "scene", "history", "settings", "underPointer", "viewport"]) assert.ok(key in back, key);
});

test("body: a switch icon by the move arrows goes to turning and by the rings back; a click on a ring chooses its axis before anything is dragged and its ring is lit; a preview while dragging does not carry the sketches (`in_206`)", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: r.lines, params: { depth: 5 } } });
  let st = createState(s);
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: ["b/body/o" as never] } } };
  const f1 = frameOf(st, { w: 800, h: 600 });
  assert.equal(f1.modeSwitch?.to, "rotate", "by the move arrows: a way to turning");
  st = reduce(st, { type: "begin", name: "rotate" }, env);
  const f2 = frameOf(st, { w: 800, h: 600 });
  assert.equal(f2.modeSwitch?.to, "move", "by the rings: a way back to moving");
  assert.equal(f2.entry!.fields[0]!.label, "Z", "Z is chosen to begin with and its angle is shown before anything is dragged");
  assert.equal(f2.gizmo!.chosen, "rot:z");
  // a click on the X ring chooses X
  const pr = projector(st.cam, 800, 600);
  const ring = f2.gizmo!.handles.find((h) => h.id === "rot:x")!;
  const [x, y] = pr.project(ring.points[Math.floor(ring.points.length / 3)]!);
  const clicked = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  assert.equal(clicked.op?.kind, "rotate", "the turn stays set up");
  assert.equal(clicked.op!.axis, 0);
  assert.equal(frameOf(clicked, { w: 800, h: 600 }).entry!.fields[0]!.label, "X");
  assert.equal(frameOf(clicked, { w: 800, h: 600 }).gizmo!.chosen, "rot:x");
  // the preview is only the step; the command made for good also carries the sketches
  const full = opCommand(scene(clicked.session), { ...clicked.op!, value: 30 })!;
  const preview = opCommand(scene(clicked.session), { ...clicked.op!, value: 30 }, { preview: true })!;
  const kinds = (c: typeof full): string[] => (c.type === "batch" ? c.commands.map((x) => x.type) : [c.type]);
  assert.ok(kinds(full).includes("transformFigure"));
  assert.deepEqual(kinds(preview), ["addStep"]);
});

test("the trim tool lights only what a click would cut, in the selected blue, and nothing where a click would cut nothing", () => {
  let s = createSession(kernel);
  s = run(s, drawChain(scene(s), XY, [[0, 0, 0], [40, 0, 0]]).command);
  s = run(s, drawChain(scene(s), XY, [[10, -10, 0], [10, 10, 0]]).command);
  s = run(s, drawCircle(scene(s), XY, [20, 40, 0], 6).command);
  s = run(s, drawChain(scene(s), XY, [[26, 40, 0], [40, 40, 0]], false, { reuse: true }).command); // (touches the circle once: it cannot be trimmed there)
  let st = { ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 20, 0] as Vec3 } };
  st = reduce(st, { type: "begin", name: "trim" }, env);
  const at = (p: Vec3) => projector(st.cam, 800, 600).project(p);
  const over = reduce(st, { type: "hover", x: at([25, 0, 0])[0], y: at([25, 0, 0])[1] }, env);
  assert.ok(over.tool!.trimming, "what would be cut is shown");
  assert.equal(over.session.hover, undefined, "the whole line is not lit");
  const away = reduce(st, { type: "hover", x: at([20, 46, 0])[0], y: at([20, 46, 0])[1] }, env);
  assert.equal(away.tool!.trimming, undefined, "a circle with one cut cannot be trimmed: nothing is lit");
  assert.equal(away.session.hover, undefined);
});
