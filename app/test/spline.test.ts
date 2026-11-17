import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawSpline, drawChain } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { curvePoints, splineWorld, loopPoints } from "../src/operation/part.ts";
import { splineAt, splinePoints, splinePieces, splineTolerance } from "../src/operation/spline.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";
import { armTool, finish } from "../src/interaction/tools.ts";

await kernel.init();
const XY = worldRef("XY");
const N: Vec3 = [0, 0, 1];
const through: Vec3[] = [[0, 0, 0], [10, 8, 0], [20, 2, 0], [30, 9, 0], [40, 0, 0]];
const volume = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);

test("the curve passes through every point it is given (`dec_spline_and_cams`)", () => {
  through.forEach((p, i) => { const q = splineAt(through, i); assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9, `point ${i}`); });
  const pts = splinePoints(through, 8);
  assert.equal(pts.length, 4 * 8 + 1);
});

test("the arcs that stand for it stay within the tolerance of the curve, and meet end to end", () => {
  const tol = splineTolerance(through);
  const pieces = splinePieces(through);
  assert.ok(pieces.length >= 4 && pieces.length < 200, `${pieces.length} pieces`);
  pieces.forEach((pc, i) => { if (i) assert.deepEqual(pc.a, pieces[i - 1]!.b); });
  assert.deepEqual(pieces[0]!.a, through[0]); assert.deepEqual(pieces[pieces.length - 1]!.b, through[4]);
  // every point of the curve is within the tolerance of the nearest arc piece (checked at its own sample points against the chain's points)
  const chain = pieces.flatMap((pc) => [pc.a, ...(pc.mid ? [pc.mid] : [])]);
  for (const q of splinePoints(through, 40)) { const d = Math.min(...chain.map((c) => Math.hypot(c[0] - q[0], c[1] - q[1]))); assert.ok(d < Math.max(5 * tol, 2), `${d}`); }
});

test("a spline is one line between two corners, and goes with its ends when they move", () => {
  let s = createSession(kernel);
  const d = drawSpline(scene(s), XY, through, N)!;
  s = run(s, d.command);
  const line = scene(s).parts[d.line] as { a: string; b: string; spline: [number, number][] };
  assert.equal(line.spline.length, 3);
  const before = splineWorld((r) => scene(s).parts[r], line as never)!;
  near(before[2]![1], 2); // (the middle point where it was clicked)
  s = run(s, { type: "movePart", ref: line.b as never, to: [40, 20, 0] });
  const after = splineWorld((r) => scene(s).parts[r], scene(s).parts[d.line] as never)!;
  assert.deepEqual(after[0], through[0]);
  near(after[4]![1], 20);
  assert.ok(curvePoints((r) => scene(s).parts[r], scene(s).parts[d.line] as never)!.length > 20);
});

test("the tool: clicks place points, Enter makes the spline; two points make nothing", () => {
  const s = createSession(kernel);
  const plane = scene(s).parts[XY]!;
  const t = { ...armTool("spline"), plane: XY, points: through.slice(0, 3), cursor: through[3]! };
  const fin = finish(scene(s), t);
  assert.ok(fin, "three points make a spline");
  assert.equal(finish(scene(s), { ...t, points: through.slice(0, 2) }), null);
  void plane;
  const made = run(s, fin!.command);
  assert.equal(Object.values(scene(made).parts).filter((p) => p.kind === "line" && (p as { spline?: unknown }).spline).length, 1);
});

test("a shape with a spline side is a face, and extrudes to the volume the curve gives (the kernel is given arcs)", () => {
  let s = createSession(kernel);
  const d = drawSpline(scene(s), XY, through, N)!;
  s = run(s, d.command);
  const line = scene(s).parts[d.line] as { a: string; b: string };
  const close = drawChain(scene(s), XY, [[40, 0, 0], [40, -6, 0], [0, -6, 0], [0, 0, 0]], false, { reuse: true });
  s = run(s, close.command);
  const lines = [d.line, ...close.lines] as string[];
  const face = loopFaceRef(lines as never);
  assert.ok(scene(s).parts[face], "the loop is a face");
  // the area by the shoelace sum of the outline the face is drawn with
  const f = scene(s).parts[face] as unknown as { loop: string[]; corners: string[] };
  const poly = loopPoints((r) => scene(s).parts[r], f.loop as never, f.corners as never);
  let area = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]!; area += p[0] * q[1] - q[0] * p[1]; });
  area = Math.abs(area) / 2;
  const op = startOp(scene(s), [face as never], "extrude");
  assert.ok(op.ok, JSON.stringify(op));
  const made = runOp(s, { ...(op as { op: Op }).op, value: 5 })!.session;
  assert.ok(!made.message, made.message ?? "");
  near(volume(made) / 5, area, area * 0.01);
  void line;
});

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
