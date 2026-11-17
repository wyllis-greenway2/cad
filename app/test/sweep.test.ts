// A sweep along a path (`in_444`, `dec_sweep`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawChain, drawArc } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";

await kernel.init();
const [XY, XZ] = [worldRef("XY"), worldRef("XZ")];
const env = { w: 800, h: 600, now: 0 } as never;
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);

/** a 4 x 4 square centred on the origin on the base plane */
function square(): { s: Session; face: string } {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return { s, face: loopFaceRef(r.lines) };
}
function begin(s: Session, sel: string[], place?: "sketch"): Op {
  const st = startOp(scene(s), sel as never, "sweep");
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  return place ? { ...op, sweepPlace: place } : op;
}

test("a square carried along a straight line up is the prism: 4 x 4 x 20", () => {
  let { s, face } = square();
  const p = drawChain(scene(s), XZ, [[0, 0, 0], [0, 0, 20]]);
  s = run(s, p.command);
  const r = runOp(s, begin(s, [face, ...p.lines]))!;
  assert.equal(r.session.message, null);
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 320) < 0.5, `volume ${volume(r.session)}`);
  assert.equal(scene(r.session).steps.at(-1)!.type, "sweep");
});

test("carried along a quarter circle of radius 20 it is a bent bar: the area times the length of the middle line (Pappus), 16 x 10 pi", () => {
  let { s, face } = square();
  const a = drawArc(scene(s), XZ, [0, 0, 0], [20 - 20 * Math.SQRT1_2, 0, 20 * Math.SQRT1_2], [20, 0, 20], [0, -1, 0])!;
  s = run(s, a.command);
  const r = runOp(s, begin(s, [face, a.line]))!;
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 16 * 10 * Math.PI) < 5, `volume ${volume(r.session)}`);
});

test("a path that runs the other way (its far end on the shape's plane) is carried from that end", () => {
  let { s, face } = square();
  const p = drawChain(scene(s), XZ, [[0, 0, 20], [0, 0, 0]]);
  s = run(s, p.command);
  const r = runOp(s, begin(s, [face, ...p.lines]))!;
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 320) < 0.5);
});

test("a path away from the shape is followed where it is: a straight one 10 to the side gives the same bar at the shape's own place, a path that starts above the plane is brought to it (`in_459`)", () => {
  let { s, face } = square();
  const p = drawChain(scene(s), XZ, [[10, 0, 0], [10, 0, 20]]);
  s = run(s, p.command);
  const r = runOp(s, begin(s, [face, ...p.lines], "sketch"))!;
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 320) < 0.5, `volume ${volume(r.session)}`);
  const box = Object.values(scene(r.session).parts).find((q) => q.kind === "body" && q.bbox) as unknown as { bbox: { min: number[]; max: number[] } };
  assert.ok(Math.abs(box.bbox.min[0]! + 2) < 1e-3 && Math.abs(box.bbox.max[0]! - 2) < 1e-3, `the bar stays where the shape is: ${box.bbox.min[0]}..${box.bbox.max[0]}`);
  let t = createSession(kernel);
  const sq = drawRectangle(scene(t), XY, [-2, -2, 0], [2, 2, 0], [1, 0, 0], [0, 1, 0]);
  t = run(t, sq.command);
  const q = drawChain(scene(t), XZ, [[0, 0, 5], [0, 0, 20]]);
  t = run(t, q.command);
  const r2 = runOp(t, begin(t, [loopFaceRef(sq.lines), ...q.lines]))!;
  assert.ok(Math.abs(volume(r2.session) - 240) < 0.5, `volume ${volume(r2.session)}`);
});

test("a bend away from the shape carries it rigidly round: the area times the length its middle travels (Pappus), the arc of radius 20 seen from 10 outside it", () => {
  let { s, face } = square();
  const a = drawArc(scene(s), XZ, [10, 0, 0], [30 - 20 * Math.SQRT1_2, 0, 20 * Math.SQRT1_2], [30, 0, 20], [0, -1, 0])!;
  s = run(s, a.command);
  const r = runOp(s, begin(s, [face, a.line], "sketch"))!;
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - 16 * 15 * Math.PI) < 8, `volume ${volume(r.session)}`);
});

test("a path that runs along the shape's plane where it starts is refused, with the reason; a shape with no path is not offered", () => {
  let { s, face } = square();
  const p = drawChain(scene(s), XZ, [[0, 0, 0], [20, 0, 0]]);
  s = run(s, p.command);
  const r = runOp(s, begin(s, [face, ...p.lines], "sketch"))!;
  assert.match(String(Object.values(r.session.outcome.errors)[0] ?? r.session.message), /plane/);
  assert.equal(startOp(scene(s), [face] as never, "sweep").ok, false);
});

test("the Sweep operation: a shape and its path selected, Enter makes the one step", () => {
  let { s, face } = square();
  const p = drawChain(scene(s), XZ, [[0, 0, 0], [0, 0, 20]]);
  s = run(s, p.command);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [face, ...p.lines] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "sweep" }, env);
  assert.equal(st.op?.kind, "sweep");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  assert.equal(scene(st.session).steps.at(-1)!.type, "sweep");
  assert.ok(Math.abs(volume(st.session) - 320) < 0.5, `volume ${volume(st.session)}`);
});

test("the path follows the sketch it was drawn in: the far corner moved from 20 to 30 makes the bar 30 long (`in_445`); a path line deleted is said to be gone", () => {
  let { s, face } = square();
  const p = drawChain(scene(s), XZ, [[0, 0, 0], [0, 0, 20]]);
  s = run(s, p.command);
  s = runOp(s, begin(s, [face, ...p.lines]))!.session;
  assert.ok(Math.abs(volume(s) - 320) < 0.5);
  const moved = run(s, { type: "movePart", ref: p.corners[1]!, to: [0, 0, 30] });
  assert.deepEqual(moved.outcome.errors, {}, JSON.stringify(moved.outcome.errors));
  assert.ok(Math.abs(volume(moved) - 480) < 0.5, `volume ${volume(moved)}`);
  const gone = run(s, { type: "deletePart", ref: p.lines[0]! });
  assert.ok(Object.values(gone.outcome.errors).length > 0 || volume(gone) === 0, "the step does not go on as if the line were there");
});

test("while the Sweep operation is open the body it would make is in the picture, the sketch's start corner is the amber dot, and nothing is made until Enter (`in_445`)", () => {
  let { s, face } = square();
  const p = drawChain(scene(s), XZ, [[0, 0, 20], [0, 0, 0]]); // (the far end is the one on the shape's plane)
  s = run(s, p.command);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [face, ...p.lines] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "sweep" }, env);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(scene(st.session).steps.length, 0, "nothing made yet");
  assert.ok(Object.values(f.scene.parts).some((q) => q.kind === "body" && (q.volume ?? 0) > 300), "the body is in the picture");
  assert.deepEqual(f.highlight.amber, [p.corners[1]], "the amber dot is on the end nearer the shape's plane");
});
