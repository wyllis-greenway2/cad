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

import { readFileSync } from "node:fs";
import { openSession } from "../src/interaction/session.ts";

test("a circle cut by two radii is two pieces, a quarter and three quarters, and each extrudes on its own", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/pie-cuts.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  let s = r.value;
  const faces = facesOf(s);
  assert.equal(faces.length, 2, "no whole disk, two pieces");
  const R = 10.622264353705381;
  const area = (Math.PI * R * R);
  const first = faces.find((f) => f.loop.length === 3)!;
  s = extrude(s, [first.ref], "10");
  assert.deepEqual(s.outcome.errors, {});
  const v1 = s.outcome.kernel!.volume!;
  const share = v1 / (area * 10);
  assert.ok(Math.abs(share - 0.25) < 0.0005 || Math.abs(share - 0.75) < 0.0005, `a quarter or three quarters of the disk (${share})`);
  // the other piece is still there to pick and extrude
  const rest = facesOf(s).filter((f) => f.ref !== first.ref);
  assert.equal(rest.length, 1);
  assert.ok(!consumed(scene(s)).has(rest[0]!.ref));
  s = extrude(s, [rest[0]!.ref], "10");
  assert.deepEqual(s.outcome.errors, {});
  assert.ok(Math.abs(s.outcome.kernel!.volume! - area * 10) < area * 10 * 0.0005, `${s.outcome.kernel!.volume} vs ${area * 10}`);
});

test("the curved wall of a piece of a circle is a real cylinder wall that can be pulled: the circle's radius changes and the other piece follows", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/pie-cuts.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  let s = r.value;
  const first = facesOf(s).find((f) => f.loop.length === 3)!;
  s = extrude(s, [first.ref], "10");
  const wall = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE")!;
  assert.ok(wall, "the wall is a cylinder");
  const edit = faceEdit(scene(s), wall.ref);
  assert.equal(edit?.kind, "radius");
  const op = startOp(scene(s), [wall.ref], "pushpull");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const R = 10.622264353705381;
  const before = s.outcome.kernel!.volume!;
  s = run(s, editCommand(scene(s), edit!, 2)!);
  assert.deepEqual(s.outcome.errors, {});
  const share = before / (Math.PI * R * R * 10);
  const after = s.outcome.kernel!.volume!;
  assert.ok(Math.abs(after - share * Math.PI * (R + 2) * (R + 2) * 10) < 0.01 * after, `${after} vs ${share * Math.PI * (R + 2) ** 2 * 10}`);
});

// ---- the general split into regions (`in_183`) ----
const draw = (s: ReturnType<typeof createSession>, cmd: { command: Parameters<typeof run>[1] }) => run(s, cmd.command);
const line = (s: ReturnType<typeof createSession>, a: [number, number, number], b: [number, number, number]) => draw(s, drawChain(scene(s), XY, [a, b]));
const areaOf = (s: ReturnType<typeof createSession>, depth = "1") => { const t = extrude(s, facesOf(s).map((f) => f.ref), depth); assert.deepEqual(t.outcome.errors, {}); return t.outcome.kernel!.volume! / Number(depth); };

test("a rectangle with a diagonal is two triangles; crossing lines cut a rectangle into four", () => {
  let s = createSession(kernel);
  s = draw(s, drawRectangle(scene(s), XY, [0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]));
  assert.equal(facesOf(s).length, 1);
  const diag = line(s, [0, 0, 0], [20, 10, 0]);
  // (the same corners, so the diagonal is drawn on the rectangle's own corners)
  const corners = Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn");
  const at = (x: number, y: number) => corners.find((c) => c.kind === "corner" && Math.hypot(c.at[0] - x, c.at[1] - y) < 1e-6)!.ref;
  s = run(s, { type: "addPart", part: { origin: "drawn", plane: XY, movable: true, ref: "d/e_900.s0" as Ref, kind: "line", a: at(0, 0), b: at(20, 10) } });
  void diag;
  assert.equal(facesOf(s).length, 2);
  near(areaOf(s), 200);
  // two lines across it, ends on the sides: four pieces
  let t = createSession(kernel);
  t = draw(t, drawRectangle(scene(t), XY, [0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]));
  t = line(t, [10, 0, 0], [10, 10, 0]);
  t = line(t, [0, 5, 0], [20, 5, 0]);
  assert.equal(facesOf(t).length, 4);
  near(areaOf(t), 200);
});

test("a line across a circle cuts it in two, wherever the ends of the line are; a line that stops inside it cuts nothing", () => {
  let s = createSession(kernel);
  s = draw(s, drawCircle(scene(s), XY, [0, 0, 0], 10));
  s = line(s, [-15, 3, 0], [15, 3, 0]);
  assert.equal(facesOf(s).length, 2);
  near(areaOf(s), Math.PI * 100, 0.5);
  let t = createSession(kernel);
  t = draw(t, drawCircle(scene(t), XY, [0, 0, 0], 10));
  t = line(t, [0, 0, 0], [5, 5, 0]);
  assert.equal(facesOf(t).length, 1);
  assert.ok(facesOf(t)[0]!.disk);
});

test("two circles that overlap are three regions: the lens and the two crescents", () => {
  let s = createSession(kernel);
  s = draw(s, drawCircle(scene(s), XY, [0, 0, 0], 10));
  s = draw(s, drawCircle(scene(s), XY, [12, 0, 0], 10));
  assert.equal(facesOf(s).length, 3);
  const lens = facesOf(s).find((f) => f.loop.length === 2 && f.corners.length === 2 && Math.abs(extrudeArea(s, f.ref) - lensArea(10, 12)) < 0.5);
  assert.ok(lens, "the lens is one of them");
  near(areaOf(s), 2 * Math.PI * 100 - lensArea(10, 12), 0.5);
});
function extrudeArea(s: ReturnType<typeof createSession>, ref: Ref) { return extrude(s, [ref], "1").outcome.kernel!.volume!; }
function lensArea(r: number, d: number) { return 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d); }
function near(a: number, b: number, tol = 1e-6) { assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`); }

test("after one region is extruded the others next to it can still be picked and extruded", () => {
  let s = createSession(kernel);
  s = draw(s, drawCircle(scene(s), XY, [0, 0, 0], 10));
  s = line(s, [-15, 3, 0], [15, 3, 0]);
  s = line(s, [2, -15, 0], [2, 15, 0]);
  const fs = facesOf(s);
  assert.equal(fs.length, 4);
  s = extrude(s, [fs[0]!.ref], "5");
  const rest = facesOf(s).filter((f) => f.ref !== fs[0]!.ref);
  assert.equal(rest.length, 3);
  assert.ok(rest.every((f) => !consumed(scene(s)).has(f.ref)));
  s = extrude(s, rest.map((f) => f.ref), "5");
  assert.deepEqual(s.outcome.errors, {});
  near(s.outcome.kernel!.volume!, Math.PI * 100 * 5, 1);
});
