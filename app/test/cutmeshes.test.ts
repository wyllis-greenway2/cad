// A cut that leaves a face the mesher cannot do (`in_1368`): the body is valid and has its volume, but a face is not drawn (the top of a cylinder with two notches cut across its rim). The cut is made again with the surfaces taken as one to within a ten thousandth of a mm, and every face comes out.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession } from "../src/interaction/session.ts";

await kernel.init();
/** the volume the triangles enclose (a mesh with a face missing does not close, and this is far from the volume the kernel reports) */
function enclosed(k: { mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } }): number {
  const V = k.mesh.vertices, T = k.mesh.triangles;
  let v = 0;
  for (let t = 0; t < T.length / 3; t++) {
    const p = (i: number) => [V[3 * i]!, V[3 * i + 1]!, V[3 * i + 2]!];
    const [A, B, C] = [p(T[3 * t]!), p(T[3 * t + 1]!), p(T[3 * t + 2]!)];
    v += (A[0]! * (B[1]! * C[2]! - B[2]! * C[1]!) - A[1]! * (B[0]! * C[2]! - B[2]! * C[0]!) + A[2]! * (B[0]! * C[1]! - B[1]! * C[0]!)) / 6;
  }
  return v;
}

test("a cylinder with two notches pulled down across its rim is drawn whole: the mesh closes, to within what the curves lose", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/cylinder-pockets.cad.json", import.meta.url), "utf8")) as unknown as { value: { outcome: { errors: object; kernel: { volume: number; mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } } } } };
  const k = r.value.outcome.kernel;
  assert.deepEqual(r.value.outcome.errors, {});
  assert.ok(Math.abs(enclosed(k) - k.volume) < 0.01 * k.volume, `the triangles enclose ${enclosed(k).toFixed(0)}, the body has ${k.volume.toFixed(0)}`);
});

import { worldRef } from "../src/shared/ref.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { drawCircle, drawChain } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { planeForDrawing } from "../src/interaction/tools.ts";

test("a cut whose corners lie 2 hundred-thousandths of a mm inside the rim (where a snap or a rounding puts them) is drawn whole", () => {
  let s = createSession(kernel);
  const R = 12.5;
  const c = drawCircle(scene(s), worldRef("XY"), [0, 0, 0], R);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 25 } } } as never);
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.startsWith("b/body/f@0,0,1"))!;
  const { plane, command } = planeForDrawing(scene(s), top.ref);
  if (command) s = run(s, command);
  const r = R - 2e-5, a = 0.9;
  const pts: [number, number, number][] = [[r, 0, 25], [r * Math.cos(a), r * Math.sin(a), 25], [r * Math.cos(a), -r * Math.sin(a), 25]];
  const ch = drawChain(scene(s), plane, [...pts, pts[0]!], true);
  s = run(s, ch.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: ch.lines, params: { depth: -8, mode: "cut" } } } as never);
  const k = s.outcome.kernel!;
  assert.deepEqual(s.outcome.errors, {});
  assert.ok(Math.abs(enclosed(k as never) - k.volume!) < 0.01 * k.volume!, `the triangles enclose ${enclosed(k as never).toFixed(0)}, the body has ${k.volume!.toFixed(0)}`);
});

test("corners held on a body's rim by a relation lie on its real circle and reach the kernel exactly: the cut is drawn whole at every angle (`dec_exact_rim_numbers`)", () => {
  let bad = 0;
  for (const [R, a0] of [[12.5, 0.1], [12.5, 0.73], [12.5, 1.31], [12.5, 2.2], [12.500019, 0.4], [12.34567, 0.9], [7.123457, 0.3], [12.5, 3.0]] as const) {
    let s = createSession(kernel);
    const c = drawCircle(scene(s), worldRef("XY"), [0, 0, 0], R);
    s = run(s, c.command);
    s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 25 } } } as never);
    const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.startsWith("b/body/f@0,0,1"))!;
    const { plane, command } = planeForDrawing(scene(s), top.ref);
    if (command) s = run(s, command);
    const rim = Object.values(scene(s).parts).find((p) => p.kind === "line" && p.origin === "body" && p.circle && Math.abs(p.circle.center[2] - 25) < 1e-6)!;
    const r = R - 3e-5; // (a corner put about where the pointer was: the relation brings it onto the circle)
    const pts: [number, number, number][] = [0, 1.9, 3.9].map((t) => [r * Math.cos(a0 + t), r * Math.sin(a0 + t), 25]);
    const ch = drawChain(scene(s), plane, [...pts, pts[0]!], true);
    s = run(s, ch.command);
    for (const corner of ch.corners.slice(0, 3)) s = run(s, { type: "addRelation", relation: { id: nextId(scene(s), "r"), kind: "onCircle", parts: [corner, rim.ref] } } as never);
    s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: ch.lines, params: { depth: -8, mode: "cut" } } } as never);
    const k = s.outcome.kernel!;
    if (Object.keys(s.outcome.errors).length || Math.abs(enclosed(k as never) - k.volume!) > 0.01 * k.volume!) bad++;
  }
  assert.equal(bad, 0, `${bad} of 8 cuts left a face undrawn`);
});

/** a cylinder of radius R, a triangle on its top with its corners where a snap puts them (on the rim to the number: `off` mm inside it) and no relation, cut 8 mm down: whether the result is drawn whole */
function notchDrawn(R: number, a0: number, off: number): boolean {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), worldRef("XY"), [0, 0, 0], R);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 25 } } } as never);
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.startsWith("b/body/f@0,0,1"))!;
  const { plane, command } = planeForDrawing(scene(s), top.ref);
  if (command) s = run(s, command);
  const r = R - off;
  const pts: [number, number, number][] = [0, 1.9, 3.9].map((t) => [r * Math.cos(a0 + t), r * Math.sin(a0 + t), 25]);
  const ch = drawChain(scene(s), plane, [...pts, pts[0]!], true);
  s = run(s, ch.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: ch.lines, params: { depth: -8, mode: "cut" } } } as never);
  const k = s.outcome.kernel!;
  return Object.keys(s.outcome.errors).length === 0 && Math.abs(enclosed(k as never) - k.volume!) <= 0.01 * k.volume!;
}

test("corners that a snap puts exactly on a rim, with no relation, are drawn whole at 40 angles (`dec_exact_rim_numbers`, `in_1387`)", () => {
  const bad = Array.from({ length: 40 }, (_, k) => 0.1 + 0.13 * k).filter((a) => !notchDrawn(12.5, a, 0));
  assert.deepEqual(bad, [], `the cuts at these angles left a face undrawn`);
});

test("corners an older file has a few hundred-thousandths inside the rim are put on it: drawn whole at 20 angles (`in_1387`)", () => {
  const bad = Array.from({ length: 20 }, (_, k) => 0.2 + 0.31 * k).filter((a) => !notchDrawn(12.5, a, 1.9e-5));
  assert.deepEqual(bad, [], `the cuts at these angles left a face undrawn`);
});
