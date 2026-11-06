import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawCircle, drawChain, drawRectangle } from "../src/operation/build.ts";
import { startOp, typeOp, opCommand } from "../src/interaction/operations.ts";
import { faceEdit, editCommand } from "../src/interaction/faceedit.ts";
import { consumed } from "../src/operation/ownership.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const XY = worldRef("XY");
const facesOf = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "face");
const extrude = (s: ReturnType<typeof createSession>, sel: Ref[], depth: string) => {
  const r = startOp(scene(s), sel, "extrude");
  assert.ok(r.ok, r.ok ? "" : r.why);
  let op = (r as { ok: true; op: Parameters<typeof typeOp>[0] }).op;
  for (const k of depth) op = typeOp(op, k);
  return run(s, opCommand(scene(s), op)!);
};

test("two figures selected together are extruded together, in one step", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, a.command);
  const c = drawCircle(scene(s), XY, [30, 5, 0], 4);
  s = run(s, c.command);
  const fs = facesOf(s);
  assert.equal(fs.length, 2);
  s = extrude(s, fs.map((f) => f.ref), "10");
  assert.deepEqual(s.outcome.errors, {});
  assert.equal(scene(s).steps.length, 1);
  assert.ok(Math.abs(s.outcome.kernel!.volume! - (100 + Math.PI * 16) * 10) < 0.5);
  assert.equal(consumed(scene(s)).has(c.circle), true, "the second figure is used up by the step too");
});

test("a figure with a figure of arcs inside it: the ring extrudes with a D-shaped hole", () => {
  let s = createSession(kernel);
  const outer = drawRectangle(scene(s), XY, [-20, -20, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, outer.command);
  // a D: a straight side and a half-circle (bulge 0.5 = a half circle) back, 10 across
  const d = drawChain(scene(s), XY, [[-5, -5, 0], [5, -5, 0]], true, { bulges: [0, 0.5] });
  s = run(s, d.command);
  const fs = facesOf(s);
  assert.equal(fs.length, 2);
  const ring = fs.find((f) => f.holes?.length)!;
  assert.ok(ring, "the rectangle has the D as a hole");
  s = extrude(s, [ring.ref], "5");
  assert.deepEqual(s.outcome.errors, {});
  const vol = s.outcome.kernel!.volume!;
  assert.ok(Math.abs(vol - (1600 - (Math.PI * 25) / 2) * 5) < 1, `hole is cut (${vol})`);
});

test("the wall of the hole of an extruded ring can be pushed and pulled: the hole's radius changes", () => {
  let s = createSession(kernel);
  const o = drawCircle(scene(s), XY, [0, 0, 0], 20);
  s = run(s, o.command);
  const i = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, i.command);
  const ring = facesOf(s).find((f) => f.holes?.length)!;
  s = extrude(s, [ring.ref], "10");
  const wall = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.curved && !p.curved.convex && Math.abs(p.curved.radius - 10) < 1e-6)!;
  const edit = faceEdit(scene(s), wall.ref);
  assert.equal(edit?.kind, "radius");
  
  s = run(s, editCommand(scene(s), edit!, 2)!); // pulled out of the hole's wall: material is added, the hole is smaller
  assert.deepEqual(s.outcome.errors, {});
  assert.ok(Math.abs(s.outcome.kernel!.volume! - Math.PI * (400 - 64) * 10) < 1, `${s.outcome.kernel!.volume}`);
  const outerWall = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.curved?.convex && Math.abs(p.curved.radius - 20) < 1e-6)!;
  assert.equal(faceEdit(scene(s), outerWall.ref)?.kind, "radius");
});
