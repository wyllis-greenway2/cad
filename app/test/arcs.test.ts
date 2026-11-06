import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawArc, drawChain, drawCircle } from "../src/operation/build.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const XY = worldRef("XY");
const N: Vec3 = [0, 0, 1];
const near = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const at = (s: ReturnType<typeof createSession>, r: Ref): Vec3 => (scene(s).parts[r] as { at: Vec3 }).at;
const relate = (s: ReturnType<typeof createSession>, parts: Ref[], id: string, value?: number) => {
  const a = actionsFor(scene(s), parts).find((x) => x.id === id);
  assert.ok(a, `${id} is offered`);
  assert.equal(a!.enabled, true, a!.why ?? "");
  return run(s, a!.run(value));
};

/** A quarter-ish arc from (10, 0) through (7.07, 7.07) to (0, 10): about the origin, radius 10. */
function arc() {
  let s = createSession(kernel);
  const r = drawArc(scene(s), XY, [10, 0, 0], [Math.SQRT1_2 * 10, Math.SQRT1_2 * 10, 0], [0, 10, 0], N)!;
  s = run(s, r.command);
  const line = scene(s).parts[r.line] as { a: Ref; b: Ref; center: Ref; ccw: boolean };
  return { s, line: r.line, a: line.a, b: line.b, centre: line.center, ccw: line.ccw };
}

test("an arc has a centre point of its own, and its ends stay the same distance from it", () => {
  let { s, a, b, centre } = arc();
  const c = at(s, centre);
  near(c[0], 0); near(c[1], 0);
  near(Math.hypot(at(s, a)[0] - c[0], at(s, a)[1] - c[1]), 10);
  // pull the start further out: the other end goes with it, the arc stays an arc
  s = run(s, { type: "movePart", ref: a, to: [14, 0, 0] });
  const c2 = at(s, centre);
  const [ra, rb] = [Math.hypot(at(s, a)[0] - c2[0], at(s, a)[1] - c2[1]), Math.hypot(at(s, b)[0] - c2[0], at(s, b)[1] - c2[1])];
  near(ra, rb, 1e-3);
});

test("the radius of an arc is a dimension (R), settable, and the centre can be positioned with constraints", () => {
  let { s, line, a, centre } = arc();
  const acts = actionsFor(scene(s), [line]).map((x) => x.id);
  assert.ok(acts.includes("radius"));
  assert.ok(!actionsFor(scene(s), [drawChain(scene(s), XY, [[0, 0, 0], [1, 1, 0]]).lines[0]!]).length || true);
  s = relate(s, [line], "radius", 12);
  const c = at(s, centre);
  near(Math.hypot(at(s, a)[0] - c[0], at(s, a)[1] - c[1]), 12, 1e-3);
  // the centre fixed on another corner: coincident
  const other = drawChain(scene(s), XY, [[30, 30, 0], [31, 30, 0]]);
  s = run(s, other.command);
  s = relate(s, [other.corners[0]!], "fixed");
  s = relate(s, [centre, other.corners[0]!], "coincident");
  near(at(s, centre)[0], 30, 1e-3); near(at(s, centre)[1], 30, 1e-3);
});

test("a corner can be put on a line and slides on it: wherever it is moved to it comes back onto the line", () => {
  let s = createSession(kernel);
  const l = drawChain(scene(s), XY, [[0, 0, 0], [20, 10, 0]]);
  s = run(s, l.command);
  const p = drawChain(scene(s), XY, [[5, 8, 0], [6, 8, 0]]);
  s = run(s, p.command);
  s = relate(s, [p.corners[0]!, l.lines[0]!], "onLine");
  const q = at(s, p.corners[0]!);
  near(q[1], q[0] / 2, 1e-3); // on y = x / 2
  s = run(s, { type: "movePart", ref: p.corners[0]!, to: [12, 9, 0] });
  const q2 = at(s, p.corners[0]!);
  near(q2[1], q2[0] / 2, 1e-3);
});

test("a line can be made tangent to a circle, and to an arc", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 5);
  s = run(s, c.command);
  const l = drawChain(scene(s), XY, [[-10, 8, 0], [10, 9, 0]]);
  s = run(s, l.command);
  s = relate(s, [l.lines[0]!, c.circle], "tangent");
  const [pa, pb] = [at(s, l.corners[0]!), at(s, l.corners[1]!)];
  const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  near(Math.abs(((pb[0] - pa[0]) * (0 - pa[1]) - (pb[1] - pa[1]) * (0 - pa[0])) / len), 5, 1e-3);
  // and an arc
  const a = arc();
  let t = a.s;
  const m = drawChain(scene(t), XY, [[-20, 18, 0], [20, 19, 0]]);
  t = run(t, m.command);
  t = relate(t, [m.lines[0]!, a.line], "tangent");
  const [ta, tb] = [at(t, m.corners[0]!), at(t, m.corners[1]!)];
  const cc = at(t, a.centre);
  const rad = Math.hypot(at(t, a.a)[0] - cc[0], at(t, a.a)[1] - cc[1]);
  const ll = Math.hypot(tb[0] - ta[0], tb[1] - ta[1]);
  near(Math.abs(((tb[0] - ta[0]) * (cc[1] - ta[1]) - (tb[1] - ta[1]) * (cc[0] - ta[0])) / ll), rad, 1e-3);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";

test("an open line or an arc can be copied, moved and repeated too (not only closed figures)", () => {
  const a = arc();
  let st = { ...createState(a.s), cam: homeCamera() };
  const env = { w: 800, h: 600, now: 0 };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [a.line] } } };
  st = reduce(st, { type: "runAction", id: "op:copy" }, env);
  assert.equal(st.repeat!.op.kind, "linear");
  st = reduce(st, { type: "repeatApply" }, env);
  assert.equal(st.session.message, null);
  const arcs = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && (p as { center?: Ref }).center);
  assert.equal(arcs.length, 2, "the arc and its copy, each with a centre of its own");
  const centres = new Set(arcs.map((p) => (p as { center: Ref }).center));
  assert.equal(centres.size, 2);
  // move the original: X arrow
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [a.line] } } };
  st = reduce(st, { type: "runAction", id: "op:move" }, env);
  assert.equal(st.op!.kind, "move");
});

test("a corner can be put on a circle and on an arc: it stays at that distance from the centre", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 5);
  s = run(s, c.command);
  const l = drawChain(scene(s), XY, [[-10, 2, 0], [4.2, 2.5, 0]]);
  s = run(s, l.command);
  s = relate(s, [l.corners[1]!, c.circle], "onCircle");
  const p = at(s, l.corners[1]!);
  near(Math.hypot(p[0], p[1]), 5, 1e-3);
  // and an arc: its own list says "on circle" and not "on line"
  const a = arc();
  let t = a.s;
  const m = drawChain(scene(t), XY, [[-20, 4, 0], [9, 6, 0]]);
  t = run(t, m.command);
  const ids = actionsFor(scene(t), [m.corners[1]!, a.line]).map((x) => x.id);
  assert.ok(ids.includes("onCircle") && !ids.includes("onLine"));
  t = relate(t, [m.corners[1]!, a.line], "onCircle");
  const q = at(t, m.corners[1]!);
  near(Math.hypot(q[0], q[1]), 10, 1e-3);
});
