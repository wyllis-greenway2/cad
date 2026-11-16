// A chamfer larger than the wall of a hollow body (`in_471`): the kernel's own round came out as a "valid" body whose cavity stuck out through the outer skin at the corner; it is refused now and the
// round is made as a region (`dec_edits_saturate`): the wall is cut through and the cavity is open there.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession } from "../src/interaction/session.ts";

await kernel.init();
const open = (text: string) => { const r = openSession(kernel as never, text); assert.ok(r.ok); return r.ok ? r.value : (null as never); };
const text = fs.readFileSync(new URL("./fixtures/invalid-chamfer-on-hollow-in_471.cad.json", import.meta.url), "utf8");
type K = { volume: number; faces: unknown[]; ops: { id: string; error: string | null; note?: string }[]; mesh: { vertices: Float32Array; triangles: Uint32Array } };

test("a chamfer wider than the wall of a hollow body takes the wall away and opens the cavity; the cavity does not stick out of the skin", () => {
  const k = open(text).outcome.kernel as unknown as K;
  const op = k.ops.find((o) => o.id === "x_s_017")!;
  assert.equal(op.error, null);
  assert.match(op.note ?? "", /region/, "it says it was made as a region");
  // the wedge is 1.7 x 1.7 / 2 x 12.1 = 17.48 mm3 of the block; 2.72 of it was cavity already: what the cut took is 14.76
  assert.ok(Math.abs(k.volume - (275.0999714600923 - 14.76)) < 0.05, `the volume is the block's less what the cut took: ${k.volume}`);
  // the mesh closes: every edge is shared by two triangles
  const { vertices: v, triangles: t } = k.mesh;
  const key = (i: number) => `${Math.round(v[i * 3]! * 1e4)},${Math.round(v[i * 3 + 1]! * 1e4)},${Math.round(v[i * 3 + 2]! * 1e4)}`;
  const count = new Map<string, number>();
  for (let i = 0; i < t.length; i += 3) for (let e = 0; e < 3; e++) { let a = key(t[i + e]!), b = key(t[i + (e + 1) % 3]!); if (a > b) [a, b] = [b, a]; count.set(`${a}|${b}`, (count.get(`${a}|${b}`) ?? 0) + 1); }
  assert.equal([...count.values()].filter((c) => c !== 2).length, 0);
});

test("the check lets a plain body and a closed hollow body pass (the case that fails is the fixture above: without the check its volume is 257.6)", async () => {
  const { makeBox } = await import("replicad");
  // @ts-expect-error (the kernel files are plain modules with no types)
  const { cavitiesInside } = await import("../src/compiler/kernel/occt/interpreter.mjs");
  const box = makeBox as never as (a: number[], b: number[]) => { cut: (o: unknown) => unknown; clone: () => unknown };
  const plain = box([0, 0, 0], [10, 10, 10]);
  assert.equal(cavitiesInside(plain as never), true, "one shell");
  const hollow = box([0, 0, 0], [10, 10, 10]).cut(box([2, 2, 2], [8, 8, 8]));
  assert.equal(cavitiesInside(hollow as never), true, "a cavity inside");
});

test("a body made hollow by subtracting a box (not the hollow tool) is treated the same: the kernel's chamfer lost the void (271 became 985 mm3), now it is refused and the round is made as a region", async () => {
  const { createSession, scene, run } = await import("../src/interaction/session.ts");
  const { worldRef } = await import("../src/shared/ref.ts");
  const { drawRectangle } = await import("../src/operation/build.ts");
  const XY = worldRef("XY");
  let s = createSession(kernel as never);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [0.5, 0.5, 0], [9.5, 9.5, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 9, mode: "new" } } } as never);
  s = run(s, { type: "addStep", step: { id: "s_102", type: "move", parts: ["b/x_s_101/o"], params: { axis: 2, value: 0.5, body: "x_s_101" } } } as never);
  s = run(s, { type: "addStep", step: { id: "s_103", type: "combine", parts: ["b/x_s_100/o", "b/x_s_101/o"], params: { mode: "subtract" } } } as never);
  assert.ok(Math.abs((s.outcome.kernel as unknown as K).volume - 271) < 1e-6, "a closed void: 1000 less 729");
  s = run(s, { type: "addStep", step: { id: "s_104", type: "edgeMod", parts: ["b/body/e@0,0,10~0,0,0~0,0,5"], params: { mode: "chamfer", value: 1.7 } } } as never);
  const v = (s.outcome.kernel as unknown as K).volume;
  // the wedge is 14.45; the part of it that was the cavity (0.7 x 0.7 / 2 x 9 = 2.21) took nothing: 271 less 12.24
  assert.ok(Math.abs(v - (271 - 12.245)) < 0.05, `the cavity is kept and opened, not lost: ${v}`);
});

test("a round that takes or adds more than its size can is not believable; an ordinary one is", async () => {
  const { makeBox } = await import("replicad");
  // @ts-expect-error (the kernel files are plain modules with no types)
  const { roundIsSane } = await import("../src/compiler/kernel/occt/interpreter.mjs");
  const bx = makeBox as never as (a: number[], b: number[]) => { cut: (o: unknown) => { chamfer: (s: number, f: unknown) => unknown }; chamfer: (s: number, f: unknown) => unknown };
  const picked = (shape: { edges: { hashCode: number; startPoint: { x: number; y: number }; endPoint: { x: number; y: number } }[] }) => new Set(shape.edges.filter((e) => Math.abs(e.startPoint.x) < 1e-6 && Math.abs(e.startPoint.y) < 1e-6 && Math.abs(e.endPoint.x) < 1e-6 && Math.abs(e.endPoint.y) < 1e-6).map((e) => e.hashCode));
  const pick = (e: { inDirection: (d: string) => { when: (f: (x: { element: { startPoint: { x: number; y: number } } }) => boolean) => unknown } }) => e.inDirection("Z").when(({ element }) => Math.abs(element.startPoint.x) < 1e-6 && Math.abs(element.startPoint.y) < 1e-6);
  const plain = bx([0, 0, 0], [10, 10, 10]);
  assert.equal(roundIsSane(plain, plain.chamfer(1.7, pick), 1.7, picked(plain as never)), true);
  const hollow = bx([0, 0, 0], [10, 10, 10]).cut(bx([0.5, 0.5, 0.5], [9.5, 9.5, 9.5]));
  assert.equal(roundIsSane(hollow, hollow.chamfer(1.7, pick), 1.7, picked(hollow as never)), false, "the kernel's chamfer of 1.7 on a 0.5 wall makes the void vanish");
  assert.equal(roundIsSane(hollow, hollow.chamfer(0.2, pick), 0.2, picked(hollow as never)), true);
});
