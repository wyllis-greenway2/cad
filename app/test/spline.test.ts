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

// ---- the points of a spline are moved by taking hold of them (`in_692`)
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { undoLast } from "../src/interaction/session.ts";

const env = { w: 800, h: 600, now: 0 };
const view = (s: ReturnType<typeof createSession>): AppState => ({ ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 5, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const drag = (st: AppState, from: Vec3, to: Vec3): AppState => {
  const [a, b] = [px(st, from), px(st, to)];
  st = reduce(st, { type: "hover", x: a[0], y: a[1] }, env);
  let [lx, ly] = a;
  for (let k = 1; k <= 4; k++) { const x = a[0] + ((b[0] - a[0]) * k) / 4, y = a[1] + ((b[1] - a[1]) * k) / 4; st = reduce(st, { type: "orbit", dx: x - lx, dy: y - ly, x, y }, env); [lx, ly] = [x, y]; }
  return reduce(st, { type: "dragEnd" }, env);
};
const select = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });
const knots = (st: AppState, ref: string) => splineWorld((r) => scene(st.session).parts[r], scene(st.session).parts[ref as never] as never)!;

test("a point of a selected spline is dragged: the curve follows it, the ends stay, and the drag is one step", () => {
  let s = createSession(kernel);
  const d = drawSpline(scene(s), XY, through, N)!;
  s = run(s, d.command);
  let st = select(view(s), [d.line]);
  const steps0 = st.session.history.scene.steps.length;
  st = drag(st, [20, 2, 0], [20, 14, 0]);
  assert.equal(st.session.message, null);
  const w = knots(st, d.line);
  near(w[2]![0], 20, 0.3); near(w[2]![1], 14, 0.3);
  assert.deepEqual(w[0], through[0]); assert.deepEqual(w[4], through[4]);
  near(w[1]![1], 8, 1e-6); // (the other points stay)
  assert.equal(st.session.history.scene.steps.length, steps0);
  void undoLast;
});

test("pressing on the curve between its points still moves the whole line, and an unselected spline's points are not taken", () => {
  let s = createSession(kernel);
  const d = drawSpline(scene(s), XY, through, N)!;
  s = run(s, d.command);
  const st = drag(view(s), [20, 2, 0], [20, 14, 0]); // (not selected: the point is not a handle)
  const w = knots(st, d.line);
  near(w[0]![1], 12, 0.3); // (the whole line went up by the drag)
  near(w[2]![1] - w[0]![1], 2, 0.3); // (and the curve kept its shape)
});

// ---- points added and taken away by a double click (`in_693`)
const dbl = (st: AppState, p: Vec3): AppState => { const [x, y] = px(st, p); st = reduce(st, { type: "hover", x, y }, env); return reduce(st, { type: "click", x, y, count: 2, shift: false }, env); };

test("a double click on the curve of a selected spline puts a point there, and on one of its points takes it away", () => {
  let s = createSession(kernel);
  const d = drawSpline(scene(s), XY, through, N)!;
  s = run(s, d.command);
  let st = select(view(s), [d.line]);
  const onCurve = splineAt(through, 1.5);
  st = dbl(st, onCurve);
  assert.equal(st.session.message, null);
  let w = knots(st, d.line);
  assert.equal(w.length, 6, "one more point");
  near(w[2]![0], onCurve[0], 0.3); near(w[2]![1], onCurve[1], 0.3); // (in its place along the curve, between the 2nd and 3rd points)
  assert.deepEqual(st.session.click.selection, [d.line], "the spline stays selected");
  st = dbl(st, w[2]!);
  w = knots(st, d.line);
  assert.equal(w.length, 5, "taken away again");
  assert.deepEqual(w[0], through[0]);
});

test("the last point between the ends cannot be taken away: the message says so", () => {
  let s = createSession(kernel);
  const d = drawSpline(scene(s), XY, [[0, 0, 0], [20, 10, 0], [40, 0, 0]], N)!;
  s = run(s, d.command);
  const st = dbl(select(view(s), [d.line]), [20, 10, 0]);
  assert.match(st.session.message ?? "", /at least one point/);
  assert.equal(knots(st, d.line).length, 3);
});

// ---- a closed spline (`in_695`)
import { drawClosedSpline, otherHalf, splineSetCommand } from "../src/operation/splinering.ts";
import { splineEnds } from "../src/operation/part.ts";

const ring: Vec3[] = [[20, 0, 0], [10, 17, 0], [-8, 14, 0], [-20, 1, 0], [-9, -16, 0], [8, -18, 0]];
const closedScene = (pts: Vec3[] = ring) => {
  let s = createSession(kernel);
  const d = drawClosedSpline(scene(s), XY, pts, N);
  assert.ok(d.ok, d.ok ? "" : d.error);
  s = run(s, d.value.command);
  assert.equal(s.message, null);
  return { s, lines: d.value.lines, select: d.value.select };
};
const unit = (a: Vec3, b: Vec3): Vec3 => { const d = [b[0] - a[0], b[1] - a[1], 0]; const l = Math.hypot(d[0]!, d[1]!); return [d[0]! / l, d[1]! / l, 0]; };
/** the angle, degrees, between the way the closed curve goes into a corner and the way it goes out (the curve's own tangents, not its drawn samples) */
const kinkAt = (s: ReturnType<typeof createSession>, lines: string[], corner: string): number => {
  const get = (r: string) => scene(s).parts[r as never] as never;
  const [la, lb] = lines.map((r) => scene(s).parts[r as never] as unknown as { a: string; b: string; ref: string });
  const [first, second] = la!.b === corner ? [la!, lb!] : [lb!, la!]; // (the side that arrives at the corner, the side that leaves it)
  const tan = (ref: string, end: boolean): Vec3 => {
    const l = scene(s).parts[ref as never] as never;
    const w = splineWorld(get as never, l)!;
    const e = splineEnds(get as never, l);
    const t = end ? w.length - 1 : 0;
    return unit(splineAt(w, t - 1e-4, e), splineAt(w, t + 1e-4, e));
  };
  const [u, v] = [tan(first.ref, true), tan(second.ref, false)];
  return (Math.acos(Math.max(-1, Math.min(1, u[0]! * v[0]! + u[1]! * v[1]!))) * 180) / Math.PI;
};

test("a closed spline is two sides between the same two corners, and comes round smoothly at both", () => {
  const { s, lines } = closedScene();
  assert.equal(lines.length, 2);
  const [a, b] = lines.map((r) => scene(s).parts[r as never] as unknown as { a: string; b: string });
  assert.equal(a!.a, b!.b); assert.equal(a!.b, b!.a);
  assert.ok(kinkAt(s, lines, a!.a) < 3, `corner 1: ${kinkAt(s, lines, a!.a)}`);
  assert.ok(kinkAt(s, lines, a!.b) < 3, `corner 2: ${kinkAt(s, lines, a!.b)}`);
  assert.ok(kinkAt(s, lines, a!.a) < 0.1, "exactly smooth");
});

test("the closed spline is a face, and it extrudes to the volume of the curve it is", () => {
  const { s, select } = closedScene();
  const face = scene(s).parts[select[0] as never] as unknown as { loop: string[]; corners: string[] };
  assert.ok(face, "the loop is a face");
  const poly = loopPoints((r) => scene(s).parts[r], face.loop as never, face.corners as never);
  let area = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]!; area += p[0] * q[1] - q[0] * p[1]; });
  area = Math.abs(area) / 2;
  const op = startOp(scene(s), [select[0] as never], "extrude");
  assert.ok(op.ok, JSON.stringify(op));
  const made = runOp(s, { ...(op as { op: Op }).op, value: 4 })!.session;
  assert.ok(!made.message, made.message ?? "");
  near(volume(made) / 4, area, area * 0.01);
});

test("a point of one half moved, added or taken away keeps the join smooth in both halves", () => {
  const { s, lines } = closedScene();
  const [a] = lines.map((r) => scene(s).parts[r as never] as unknown as { a: string; b: string });
  let st = select(view(s), [lines[0]!]);
  const moved = knots(st, lines[0]!)[1]!; // (the point next to the start of the first half)
  st = drag(st, moved, [moved[0] + 3, moved[1] + 6, 0]);
  assert.equal(st.session.message, null);
  assert.ok(kinkAt(st.session, lines, a!.a) < 0.1, `after moving: ${kinkAt(st.session, lines, a!.a)}`);
  assert.ok(kinkAt(st.session, lines, a!.b) < 0.1);
  const before = knots(st, lines[0]!).length;
  const where = knots(st, lines[0]!)[1]!;
  st = dbl(st, where); // (taken away)
  assert.equal(knots(st, lines[0]!).length, before - 1);
  assert.ok(kinkAt(st.session, lines, a!.a) < 0.1 && kinkAt(st.session, lines, a!.b) < 0.1, "still smooth after taking a point away");
  void otherHalf; void splineSetCommand; void splineEnds;
});

test("the tool closes the curve when a click lands on its first point", () => {
  const s = createSession(kernel);
  const t = { ...armTool("spline"), plane: XY, points: [...ring, ring[0]!], cursor: ring[0]! };
  const fin = finish(scene(s), t);
  assert.ok(fin, "closed");
  const made = run(s, fin!.command);
  assert.equal(Object.values(scene(made).parts).filter((p) => p.kind === "line" && (p as { around?: unknown }).around).length, 2);
  // three points are enough; two are not
  assert.ok(finish(scene(s), { ...t, points: [ring[0]!, ring[1]!, ring[2]!, ring[0]!] }));
  assert.equal(finish(scene(s), { ...t, points: [ring[0]!, ring[1]!, ring[0]!] }), null);
});
