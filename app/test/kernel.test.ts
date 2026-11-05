import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { newHistory, exec } from "../src/operation/history.ts";
import type { History } from "../src/operation/history.ts";
import { drawRectangle, drawCircle, drawChain } from "../src/operation/build.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { compile } from "../src/compiler/compile.ts";
import { loopOf } from "../src/compiler/graph.ts";
import { lookup, nextId } from "../src/operation/scene.ts";
import { cornerName } from "../src/compiler/body.ts";
import { actionsFor } from "../src/interaction/actions.ts";

await kernel.init();
const XY = worldRef("XY");
const must = (r: ReturnType<typeof exec>): History => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.value;
};
const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

function box(w = 40, d = 20, depth = 20) {
  const r = drawRectangle(newHistory().scene, XY, [-w / 2, -d / 2, 0], [w / 2, d / 2, 0], [1, 0, 0], [0, 1, 0]);
  let h = must(exec(newHistory(), r.command));
  h = must(exec(h, { type: "addStep", step: { id: nextId(h.scene, "s"), type: "extrude", parts: r.lines, params: { depth } } }));
  return { h, ...r };
}

test("lines are put in order as one closed loop, or refused", () => {
  const { h, lines } = box();
  const get = lookup(h.scene);
  assert.equal(loopOf(get, [lines[2]!, lines[0]!, lines[3]!, lines[1]!]).ok, true);
  assert.equal(loopOf(get, [lines[0]!, lines[1]!]).ok, false);
  assert.equal(loopOf(get, []).ok, false);
});

test("a rectangle extruded: volume, and the body appears as corners, lines and planes", () => {
  const { h } = box();
  const out = compile(h.scene, kernel);
  assert.deepEqual(out.errors, {});
  near(out.kernel!.volume!, 40 * 20 * 20);
  const body = Object.values(out.scene.parts).filter((p) => p.origin === "body");
  assert.equal(body.filter((p) => p.kind === "corner").length, 8);
  assert.equal(body.filter((p) => p.kind === "line").length, 12);
  assert.equal(body.filter((p) => p.kind === "plane").length, 6);
  assert.ok(body.every((p) => !p.movable));
  assert.ok(cornerName([20, 10, 20]) in out.scene.parts);
});

test("a circle extruded and a negative extrude cuts a hole", () => {
  let { h } = box();
  // draw the circle on the top face of the body (a plane of the body, found by its name)
  const top = Object.values(compile(h.scene, kernel).scene.parts).find((p) => p.kind === "plane" && p.at[2] === 20)!;
  h = must(exec(h, { type: "addPart", part: top })); // body parts are derived; the plane is added so a drawn part can name it
  const onTop = drawCircle(h.scene, top.ref, [0, 0, 20], 5);
  h = must(exec(h, onTop.command));
  h = must(exec(h, { type: "addStep", step: { id: nextId(h.scene, "s"), type: "extrude", parts: [onTop.circle], params: { depth: -20 } } }));
  const out = compile(h.scene, kernel);
  assert.deepEqual(out.errors, {});
  near(out.kernel!.volume!, 40 * 20 * 20 - Math.PI * 25 * 20, 0.5);
});

test("round several lines of the body at once, found by their names", () => {
  const { h: h0 } = box();
  const body = compile(h0.scene, kernel).scene;
  const verticals = Object.values(body.parts).filter((p) => p.kind === "line" && p.origin === "body" && (body.parts[p.a] as { at: Vec3 }).at[2] !== (body.parts[p.b] as { at: Vec3 }).at[2]);
  assert.equal(verticals.length, 4);
  const h = must(exec(h0, { type: "addStep", step: { id: nextId(h0.scene, "s"), type: "edgeMod", parts: verticals.map((p) => p.ref), params: { mode: "fillet", value: 3 } } }));
  const out = compile(h.scene, kernel);
  assert.deepEqual(out.errors, {});
  near(out.kernel!.volume!, 40 * 20 * 20 - 4 * (1 - Math.PI / 4) * 9 * 20, 0.5);
});

test("a step that cannot be built is reported with the reason; an open shape cannot be extruded", () => {
  const open = drawChain(newHistory().scene, XY, [[0, 0, 0], [10, 0, 0], [10, 10, 0]]);
  let h = must(exec(newHistory(), open.command));
  h = must(exec(h, { type: "addStep", step: { id: "s_900", type: "extrude", parts: open.lines, params: { depth: 5 } } }));
  const out = compile(h.scene, kernel);
  assert.match(out.errors["s_900"] ?? "", /closed/);
  assert.equal(out.kernel, null);
});

test("relations are solved before the body is built: a slanted rectangle side made vertical changes the body", () => {
  let { h, lines, corners } = box(40, 20, 10);
  h = must(exec(h, { type: "movePart", ref: corners[1]!, to: [30, -10, 0] })); // pull one corner so the side leans
  const a = actionsFor(h.scene, [lines[1]!]).find((x) => x.id === "vertical")!;
  h = must(exec(h, a.run()));
  const out = compile(h.scene, kernel);
  assert.equal(out.solve.planes[0]!.status, "ok");
  const p = out.scene.parts[corners[1]!] as { at: Vec3 };
  const q = out.scene.parts[corners[2]!] as { at: Vec3 };
  near(p.at[0], q.at[0], 1e-6);
  assert.deepEqual(out.errors, {});
});

test("the same model gives the same names; unchanged corners keep their names after another step", () => {
  const { h } = box();
  const a = compile(h.scene, kernel).scene;
  const b = compile(h.scene, kernel).scene;
  assert.deepEqual(Object.keys(a.parts).sort(), Object.keys(b.parts).sort());
  const bottomCorner: Ref = cornerName([-20, -10, 0]);
  assert.ok(bottomCorner in a.parts);
  const taller = must(exec(h, { type: "addStep", step: { id: "s_950", type: "move", parts: [], params: { axis: 0, value: 5 } } }));
  assert.ok(!(bottomCorner in compile(taller.scene, kernel).scene.parts), "after a move the corner is elsewhere: its old name is gone (reported broken, not guessed)");
});

test("push and pull a flat face of the body: out adds material, in cuts it (the same step either way)", () => {
  const { h } = box();
  const compiled = compile(h.scene, kernel).scene; // a session's scenes already carry the body parts; a bare history does not
  const top = Object.values(compiled.parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  const run = (depth: number) => compile({ ...compiled, steps: [...compiled.steps, { id: "s_700", type: "pushPull", parts: [top.ref], params: { depth } }] }, kernel);
  const out = run(10);
  assert.deepEqual(out.errors, {});
  near(out.kernel!.volume!, 40 * 20 * 30);
  near(run(-5).kernel!.volume!, 40 * 20 * 15);
});
