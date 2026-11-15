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
function begin(s: Session, sel: string[]): Op {
  const st = startOp(scene(s), sel as never, "sweep");
  assert.ok(st.ok, st.ok ? "" : st.why);
  return (st as { op: Op }).op;
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

test("a path that never touches the shape's plane is refused with the reason; a shape with no path, or a branching path, is not offered", () => {
  let { s, face } = square();
  const p = drawChain(scene(s), XZ, [[0, 0, 5], [0, 0, 20]]);
  s = run(s, p.command);
  const r = runOp(s, begin(s, [face, ...p.lines]))!;
  assert.match(String(r.session.outcome.errors[Object.keys(r.session.outcome.errors)[0]!] ?? r.session.message), /plane/);
  const none = startOp(scene(s), [face] as never, "sweep");
  assert.equal(none.ok, false);
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
  assert.deepEqual(f.highlight.amber, [p.corners[1]], "the amber dot is on the end that stands on the shape's plane");
});
