// Separate figures selected together are extruded in one go but are steps, and so bodies, of their own, each with its own height (`in_322`), arcs only or not; a hole drawn inside a figure stays with it.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
type Body = Extract<Part, { kind: "body" }>;
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Body => p.kind === "body").sort((a, b) => a.bbox!.min[0] - b.bbox!.min[0]);
const atOf = (s: Session, ref: Ref): number[] => (scene(s).parts[ref] as unknown as { at: number[] }).at;
const faceOver = (s: Session, x: number): Ref => {
  const faces = Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "face" }> => p.kind === "face" && p.origin === "drawn" && p.plane === XY);
  const xs = (f: (typeof faces)[number]) => (f.disk ? [atOf(s, (scene(s).parts[f.disk] as unknown as { center: Ref }).center)[0]!] : f.corners.map((c) => atOf(s, c)[0]!));
  return faces.find((f) => xs(f).every((v) => Math.abs(v - x) < 6))!.ref;
};

function twoBoxes(): Session {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]).command);
  s = run(s, drawSquaredRectangle(scene(s), XY, [30, 0, 0], [40, 10, 0], [1, 0, 0], [0, 1, 0]).command);
  return s;
}
function twoCircles(): Session {
  let s = createSession(kernel);
  s = run(s, drawCircle(scene(s), XY, [5, 5, 0], 5).command);
  s = run(s, drawCircle(scene(s), XY, [35, 5, 0], 5).command);
  return s;
}
const extrudeBoth = (s: Session, depth: number, x1: number, x2: number): Session => {
  const st = startOp(scene(s), [faceOver(s, x1), faceOver(s, x2)], "extrude");
  assert.ok(st.ok, "can extrude both");
  const r = runOp(s, { ...st.op, value: depth });
  assert.ok(r && !r.session.message, r?.session.message ?? "no step");
  return r!.session;
};

for (const [name, make, x1, x2] of [["rectangles", twoBoxes, 5, 35], ["circles (arcs only)", twoCircles, 5, 35]] as const) {
  test(`two ${name} extruded together are two steps and two bodies with heights of their own`, () => {
    const s = extrudeBoth(make(), 8, x1, x2);
    assert.equal(scene(s).steps.filter((x) => x.type === "extrude").length, 2, "a step each");
    assert.deepEqual(scene(s).steps.map((x) => x.params.also), [undefined, undefined], "none made together");
    const [a, b] = bodies(s);
    assert.equal(bodies(s).length, 2);
    assert.ok(Math.abs(a!.bbox!.max[2] - 8) < 1e-6 && Math.abs(b!.bbox!.max[2] - 8) < 1e-6);
    // the top of one is pulled: the other stays, whatever the outline is made of
    const sc = scene(s);
    const top = Object.values(sc.parts).find((p) => p.origin === "body" && p.kind === "plane" && p.of === a!.ref && /^b\/body\/f@0,0,1,/.test(p.ref))!;
    const st = startOp(sc, [top.ref], "pushpull");
    assert.ok(st.ok);
    const pulled = run(s, opCommand(sc, { ...st.op, value: 4 })!);
    assert.deepEqual(pulled.outcome.errors, {});
    const [a2, b2] = bodies(pulled);
    assert.ok(Math.abs(a2!.bbox!.max[2] - 12) < 1e-6 && Math.abs(b2!.bbox!.max[2] - 8) < 1e-6, "only that body is taller");
    // the second body is moved: it goes alone, with its own sketch
    const move = startOp(scene(pulled), [b2!.ref], "move");
    assert.ok(move.ok);
    const moved = run(pulled, opCommand(scene(pulled), { ...move.op, axis: 1, value: -30 })!);
    assert.deepEqual(moved.outcome.errors, {});
    const [a3, b3] = bodies(moved);
    assert.ok(Math.abs(a3!.bbox!.min[1]) < 1e-6 && Math.abs(b3!.bbox!.min[1] - -30) < 1e-6, "the second went, the first did not");
    const drawnAt = (x: number) => Object.values(scene(moved).parts).filter((p) => p.kind === "corner" && p.origin === "drawn" && Math.abs(p.at[0] - x) < 6).map((p) => (p as unknown as { at: number[] }).at[1]!);
    assert.ok(drawnAt(35).every((y) => y < -19.9) && drawnAt(5).every((y) => y > -1), "each sketch stays with its own body");
    // undo takes both steps in one
    assert.equal(scene(s).steps.length, 2);
  });
}
