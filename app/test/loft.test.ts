// A loft through sketches (`in_431`, `in_432`, `dec_loft_sketches`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef, drawnRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { loopFaceRef, diskFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const XY = worldRef("XY");
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);

/** a plane across Z at the height given, a sketch plane of its own */
function planeAt(s: Session, z: number): { s: Session; ref: string } {
  const ref = drawnRef(nextId(scene(s), "p"));
  const s2 = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0] } } as never);
  return { s: s2, ref };
}
/** a square of side `a` on the base plane, a rectangle `b` x `b` at height `h` above it (centred on the same line) */
function twoSquares(a: number, b: number, h: number): { s: Session; faces: string[] } {
  let s = createSession(kernel);
  const r1 = drawRectangle(scene(s), XY, [-a / 2, -a / 2, 0], [a / 2, a / 2, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r1.command);
  const up = planeAt(s, h);
  s = up.s;
  const r2 = drawRectangle(scene(s), up.ref as never, [-b / 2, -b / 2, h], [b / 2, b / 2, h], [1, 0, 0], [0, 1, 0]);
  s = run(s, r2.command);
  return { s, faces: [loopFaceRef(r1.lines), loopFaceRef(r2.lines)] };
}
function begin(s: Session, faces: string[], extra: Partial<Op> = {}): Op {
  const st = startOp(scene(s), faces as never, "loft");
  assert.ok(st.ok, st.ok ? "" : st.why);
  return { ...(st as { op: Op }).op, ...extra };
}

test("two squares of different sizes at different heights are joined into a frustum: the volume is the prismatoid's (a + b)^2 / ... h / 3 (a^2 + ab + b^2)", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  const r = runOp(s, begin(s, faces))!;
  assert.equal(r.session.message, null);
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - (20 / 3) * (100 + 40 + 16)) < 0.5, `volume ${volume(r.session)}`);
});

test("a ruled loft between two squares is the same frustum; the sketches are used up by it", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  const r = runOp(s, begin(s, faces, { loftRuled: true }))!;
  assert.deepEqual(r.session.outcome.errors, {});
  assert.ok(Math.abs(volume(r.session) - (20 / 3) * 156) < 0.5);
  assert.equal(scene(r.session).steps.at(-1)!.type, "loft");
});

test("sketches with different numbers of parts are refused with the reason, and joined when Split to match is on (a circle becomes arcs, a side is cut in two)", () => {
  let s = createSession(kernel);
  const r1 = drawRectangle(scene(s), XY, [-5, -5, 0], [5, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r1.command);
  const up = planeAt(s, 15);
  s = up.s;
  const c = drawCircle(scene(s), up.ref as never, [0, 0, 15], 3);
  s = run(s, c.command);
  const faces = [loopFaceRef(r1.lines), diskFaceRef(c.circle)];
  const op = begin(s, faces);
  const refused = runOp(s, op)!;
  assert.ok(Object.values(refused.session.outcome.errors).some((e) => /different numbers of parts/.test(e)) || /different numbers of parts/.test(refused.session.message ?? ""), JSON.stringify(refused.session.outcome.errors));
  const ok = runOp(s, { ...op, loftSplit: true })!;
  assert.deepEqual(ok.session.outcome.errors, {});
  const v = volume(ok.session);
  assert.ok(v > (15 / 3) * (Math.PI * 9) && v < 15 * 100, `a body between a circle and a square: ${v}`);
});

test("the start point and the direction of a sketch can be changed: a square started a quarter further on is the same frustum turned, and reversed it still loft", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  const a = runOp(s, begin(s, faces, { loftShift: [0, 1] }))!;
  assert.deepEqual(a.session.outcome.errors, {});
  assert.ok(Math.abs(volume(a.session) - (20 / 3) * 156) < 0.5, "a square started a quarter on is the same shape, joined to the same sides moved on");
  const b = runOp(s, begin(s, faces, { loftRev: [false, true] }))!;
  assert.equal(b.session.message, null);
});

test("one sketch is not enough to loft", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  const st = startOp(scene(s), [faces[0]!] as never, "loft");
  assert.equal(st.ok, false);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { homeCamera } from "../src/interaction/camera.ts";
const env = { w: 800, h: 600, now: 0 } as never;

test("the Loft operation: with two sketches selected it opens with its chips and start dots, Split and the start point are chosen, Enter makes the one step", () => {
  const { s, faces } = twoSquares(10, 4, 20);
  let st = { ...createState({ ...s, click: { ...s.click, selection: faces as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "loft" }, env);
  assert.equal(st.op?.kind, "loft");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f.loftKinds!.map((k) => k.id), ["smooth", "ruled", "split", "start:0", "rev:0", "start:1", "rev:1"]);
  assert.equal(f.highlight.amber.length, 2, "a start dot on each sketch");
  st = reduce(st, { type: "loftKind", id: "start:1" }, env);
  st = reduce(st, { type: "loftKind", id: "ruled" }, env);
  assert.deepEqual(st.op!.loftShift, [0, 1]);
  assert.equal(st.op!.loftRuled, true);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.session.message, null);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "loft");
  assert.equal(step.params.ruled, 1);
  assert.equal(step.params.shift, "0,1");
  assert.ok(volume(st.session) > 400, `the body: ${volume(st.session)}`);
});
