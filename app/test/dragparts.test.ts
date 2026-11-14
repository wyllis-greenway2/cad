// A drawing is dragged by its parts (`in_290`): a whole straight line across its plane, and the edge of a circle to change its diameter (not when that is locked).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { drawChain, drawCircle } from "../src/operation/build.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
const view = (s = createSession(kernel)): AppState => ({ ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const drag = (st: AppState, from: Vec3, to: Vec3): AppState => {
  const [a, b] = [px(st, from), px(st, to)];
  st = reduce(st, { type: "hover", x: a[0], y: a[1] }, env);
  let [lx, ly] = a;
  for (let k = 1; k <= 4; k++) { const x = a[0] + ((b[0] - a[0]) * k) / 4, y = a[1] + ((b[1] - a[1]) * k) / 4; st = reduce(st, { type: "orbit", dx: x - lx, dy: y - ly, x, y }, env); [lx, ly] = [x, y]; }
  return reduce(st, { type: "dragEnd" }, env);
};
const at = (st: AppState, ref: string) => (scene(st.session).parts[ref as never] as unknown as { at: number[] }).at;
const near = (a: number, b: number, tol = 0.15) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("a straight line is dragged whole: both ends go by the same amount", () => {
  let s = createSession(kernel);
  const d = drawChain(scene(s), XY, [[5, 5, 0], [25, 5, 0]], false, { reuse: true });
  s = run(s, d.command);
  let st = view(s);
  st = drag(st, [15, 5, 0], [20, 12, 0]);
  const [a, b] = [at(st, d.corners[0]!), at(st, d.corners[1]!)];
  near(a[0]!, 10); near(a[1]!, 12); near(b[0]!, 30); near(b[1]!, 12);
  assert.equal(st.session.message, null);
});

test("a line with one end locked is not dragged, and says why; a line whose ends are free is", () => {
  let s = createSession(kernel);
  const d = drawChain(scene(s), XY, [[5, 5, 0], [25, 5, 0]], false, { reuse: true });
  s = run(s, d.command);
  s = run(s, { type: "addRelation", relation: { id: "r_x", kind: "fixed", parts: [d.corners[0]!] } });
  const st = drag(view(s), [15, 5, 0], [20, 12, 0]);
  near(at(st, d.corners[0]!)[0]!, 5); near(at(st, d.corners[0]!)[1]!, 5);
});

test("the edge of a circle is dragged to change its diameter; with the diameter locked it is not, and says so", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [20, 15, 0], 6);
  s = run(s, c.command);
  let st = view(s);
  st = drag(st, [26, 15, 0], [30, 15, 0]);
  const r = (scene(st.session).parts[c.circle] as { radius: number }).radius;
  near(r, 10, 0.3);
  // locked
  const locked = run(s, { type: "addRelation", relation: { id: "r_d", kind: "diameter", parts: [c.circle], value: 12, locked: true } });
  const after = drag(view(locked), [26, 15, 0], [30, 15, 0]);
  near((scene(after.session).parts[c.circle] as { radius: number }).radius, 6, 0.05);
  assert.match(after.session.message ?? "", /locked/);
});

import { frameOf } from "../src/interaction/frame.ts";
test("a point of a drawing that is dragged takes the constraints a hover offers while drawing, shows them, and keeps them when it is let go (`in_290`)", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [40, 20, 0], 6);
  s = run(s, c.command);
  const d = drawChain(scene(s), XY, [[5, 5, 0], [25, 5, 0]], false, { reuse: true });
  s = run(s, d.command);
  let st = view(s);
  // an end of the line taken to the edge of the circle: it lands on it and says so
  const [a, b] = [px(st, [25, 5, 0]), px(st, [34.05, 20.1, 0])];
  st = reduce(st, { type: "hover", x: a[0], y: a[1] }, env);
  st = reduce(st, { type: "orbit", dx: b[0] - a[0], dy: b[1] - a[1], x: b[0], y: b[1] }, env); // (the first move takes hold of the point, the next ones move it)
  st = reduce(st, { type: "orbit", dx: 0.5, dy: 0, x: b[0] + 0.5, y: b[1] }, env);
  assert.deepEqual(frameOf(st, { w: env.w, h: env.h }).hint?.kinds, ["onCircle"], "the hint shows while it is dragged");
  assert.ok(frameOf(st, { w: env.w, h: env.h }).highlight.amber?.includes(c.circle), "and the circle is lit");
  st = reduce(st, { type: "dragEnd" }, env);
  assert.equal(frameOf(st, { w: env.w, h: env.h }).hint, null);
  const end = at(st, d.corners[1]!);
  near(Math.hypot(end[0]! - 40, end[1]! - 20), 6, 0.02);
  assert.ok(scene(st.session).relations.some((r) => r.kind === "onCircle" && r.parts.includes(d.corners[1]!) && r.parts.includes(c.circle)), "the end is kept on the circle");
});

test("the centre of a circle dragged near the edge of another circle lands on it and keeps that", () => {
  let s = createSession(kernel);
  const big = drawCircle(scene(s), XY, [20, 15, 0], 10);
  s = run(s, big.command);
  const small = drawCircle(scene(s), XY, [50, 15, 0], 3);
  s = run(s, small.command);
  let st = view(s);
  const [a, b] = [px(st, [50, 15, 0]), px(st, [30.05, 15.1, 0])];
  st = reduce(st, { type: "hover", x: a[0], y: a[1] }, env);
  st = reduce(st, { type: "orbit", dx: b[0] - a[0], dy: b[1] - a[1], x: b[0], y: b[1] }, env);
  st = reduce(st, { type: "orbit", dx: 0.5, dy: 0, x: b[0] + 0.5, y: b[1] }, env);
  st = reduce(st, { type: "dragEnd" }, env);
  assert.ok(scene(st.session).relations.some((r) => r.kind === "onCircle" && r.parts.includes(small.centre) && r.parts.includes(big.circle)), "the centre is on the large circle's edge");
});

import { suggestionsFor, nearCommand } from "../src/interaction/suggest.ts";
test("a selected centre of a circle that lies close to the edge of another circle is offered 'on the circle', and the offer puts it there (`in_290`)", () => {
  let s = createSession(kernel);
  const big = drawCircle(scene(s), XY, [20, 15, 0], 10);
  s = run(s, big.command);
  const small = drawCircle(scene(s), XY, [30.3, 15, 0], 3);
  s = run(s, small.command);
  const sg = suggestionsFor(scene(s), [small.centre]);
  const item = sg?.items.find((i) => i.id === `near:onCircle:${big.circle}`);
  assert.ok(item, `offered: ${JSON.stringify(sg?.items.map((i) => i.id))}`);
  const cmd = nearCommand(scene(s), [small.centre], item!.id)!;
  const after = run(s, cmd);
  assert.ok(scene(after).relations.some((r) => r.kind === "onCircle" && r.parts.includes(small.centre) && r.parts.includes(big.circle)));
  const c = (scene(after).parts[small.centre] as unknown as { at: number[] }).at;
  near(Math.hypot(c[0]! - 20, c[1]! - 15), 10, 0.02);
  // far away: nothing offered
  const farOne = drawCircle(scene(after), XY, [60, 40, 0], 3);
  const s2 = run(after, farOne.command);
  assert.ok(!suggestionsFor(scene(s2), [farOne.centre])?.items.some((i) => i.id.startsWith("near:")), "not close: not offered");
});
