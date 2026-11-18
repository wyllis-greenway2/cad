// A model of many parts apart is cut into pieces that are made alone (`dec_progressive_open`, `in_915`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { graphOf } from "../src/compiler/compile.ts";
import { planPieces, ghostsOf, MIN_PIECES } from "../src/compiler/kernel/pieces.ts";
import type { Kernel, KernelGraph } from "../src/compiler/kernel/adapter.ts";
import { projectText } from "./pieceshelp.ts";

await kernel.init();
const EMPTY = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const nokernel = { name: "none", init: async () => ({}), evaluate: () => ({ ...EMPTY, stale: true }) as never, exportMesh: async () => ({ ok: false, error: "no" }), exportStep: async () => ({ ok: false, error: "no" }), lagging: true } as unknown as Kernel;

const graphFor = (text: string): KernelGraph => {
  const r = openSession(nokernel, text);
  assert.ok(r.ok);
  return { ...graphOf(scene(r.value)), names: true } as KernelGraph;
};

test("forty boxes apart are forty pieces, each a graph of its own steps, and their bodies and volumes are the whole's", () => {
  const g = graphFor(projectText(40));
  const plan = planPieces(g);
  assert.ok(plan);
  assert.equal(plan.pieces.length, 40);
  assert.equal(plan.ghosts.length, 40);
  const whole = kernel.evaluate(g) as unknown as { bodies: { id: string; volume: number }[]; volume: number };
  let volume = 0;
  const ids: string[] = [];
  for (const p of plan.pieces) {
    const r = kernel.evaluate(p.graph) as unknown as { bodies: { id: string; volume: number }[]; volume: number; ops: { error: string | null }[] };
    assert.deepEqual(r.ops.filter((o) => o.error), []);
    volume += r.volume; ids.push(...r.bodies.map((b) => b.id));
  }
  assert.ok(Math.abs(volume - whole.volume) < 1e-6, `${volume} against ${whole.volume}`);
  assert.deepEqual(ids.sort(), whole.bodies.map((b) => b.id).sort());
  // the ghost of a part is its body's box
  for (const gh of plan.ghosts) { const b = whole.bodies.find((x) => x.id === gh.id) as unknown as { min: number[]; max: number[] }; for (let i = 0; i < 3; i++) { assert.ok(Math.abs(gh.box.min[i]! - b.min[i]!) < 1e-6 && Math.abs(gh.box.max[i]! - b.max[i]!) < 1e-6, gh.id); } }
});

test("parts that touch are one piece, and the pieces are nearest the eye first", () => {
  const g = graphFor(projectText(30, (k) => (k === 1 ? [8, 0] : [(k % 8) * 12 + (k > 1 ? 0 : 0), Math.floor(k / 8) * 12 + (k === 0 ? 0 : 0)]).map((v, i) => (k === 1 && i === 1 ? 0 : v)) as [number, number]));
  const plan = planPieces(g)!;
  assert.ok(plan);
  assert.ok(plan.pieces.length < 30, `${plan.pieces.length} pieces`);
  assert.ok(plan.pieces.some((p) => p.ghosts.length > 1), "a piece of more than one part");
  const far = planPieces(g, [1000, 1000, 0])!, near = planPieces(g, [0, 0, 0])!;
  const d = (p: { centre: number[] }, e: number[]) => Math.hypot(p.centre[0]! - e[0]!, p.centre[1]! - e[1]!);
  assert.ok(d(near.pieces[0]!, [0, 0]) <= d(near.pieces.at(-1)!, [0, 0]), "the nearest first");
  assert.ok(d(far.pieces[0]!, [1000, 1000]) <= d(far.pieces.at(-1)!, [1000, 1000]));
});

test("a graph that is anything but pushes into bodies of their own, or has few parts, is not cut", () => {
  assert.equal(planPieces(graphFor(projectText(MIN_PIECES - 1))), null, "few parts");
  const g = graphFor(projectText(30));
  const withFillet: KernelGraph = { ...g, ops: [...g.ops, { id: "x_f", type: "edgeMod", target: g.ops.at(-1)!.id, mode: "fillet", value: 1, ref: [] }] };
  assert.equal(planPieces(withFillet), null);
  assert.equal(ghostsOf({ ...g, ops: g.ops.map((o) => (o.type === "extrude" && o.id === "x_s_004" ? { ...o, mode: "cutOrAdd" } : o)) }), null, "a push that may cut");
});

import { mergeAnswers } from "../src/compiler/kernel/merge.ts";
type Ans = { bodies: { id: string; volume: number; min: number[]; max: number[] }[]; volume: number; bbox: { min: number[]; max: number[] }; mesh: { vertices: Float32Array; triangles: Uint32Array; normals: Float32Array; sharp: Float32Array }; faces: { start: number; count: number; body?: number; type?: string; n?: number[]; d?: number }[]; edges: { body?: number; type: string }[]; vertices: number[][]; faceNames: { name: string }[]; vertexBodies?: number[] };

test("the answers of the pieces put together are the whole's: the same bodies, volume, box, faces, edges, corners, names and triangles", () => {
  const g = graphFor(projectText(30));
  const plan = planPieces(g)!;
  const whole = kernel.evaluate(g) as unknown as Ans;
  const merged = mergeAnswers(plan.pieces.map((p) => kernel.evaluate(p.graph))) as unknown as Ans;
  const byId = (a: Ans) => a.bodies.map((b) => [b.id, Math.round(b.volume * 1e6), b.min.map((v) => Math.round(v * 1e5)), b.max.map((v) => Math.round(v * 1e5))]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  assert.deepEqual(byId(merged), byId(whole));
  assert.ok(Math.abs(merged.volume - whole.volume) < 1e-6);
  assert.deepEqual(merged.bbox, whole.bbox);
  assert.equal(merged.mesh.vertices.length, whole.mesh.vertices.length);
  assert.equal(merged.mesh.triangles.length, whole.mesh.triangles.length);
  assert.equal(merged.mesh.sharp.length, whole.mesh.sharp.length);
  assert.equal(merged.edges.length, whole.edges.length);
  assert.equal(merged.vertices.length, whole.vertices.length);
  assert.deepEqual(merged.faceNames.map((f) => f.name).sort(), whole.faceNames.map((f) => f.name).sort());
  // each face: of its body, its kind, its normal and offset, its number of triangles; and its triangles are a face of that body's mesh (every index inside the vertices)
  const face = (a: Ans) => a.faces.map((f) => `${a.bodies[f.body!]!.id}|${f.type}|${(f.n ?? []).map((v) => Math.round(v * 1e6)).join(",")}|${Math.round((f.d ?? 0) * 1e5)}|${f.count}`).sort();
  assert.deepEqual(face(merged), face(whole));
  for (const f of merged.faces) for (let k = f.start; k < f.start + f.count; k++) assert.ok(merged.mesh.triangles[k]! < merged.mesh.vertices.length / 3, "a corner of the mesh");
  const edgeOf = (a: Ans) => a.edges.map((e) => `${a.bodies[e.body!]!.id}|${e.type}`).sort();
  assert.deepEqual(edgeOf(merged), edgeOf(whole));
});

test("the answers so far (some pieces made) are an answer of their own, and none is an answer with no body", () => {
  const g = graphFor(projectText(30));
  const plan = planPieces(g)!;
  const first = mergeAnswers(plan.pieces.slice(0, 3).map((p) => kernel.evaluate(p.graph))) as unknown as Ans;
  assert.equal(first.bodies.length, 3);
  assert.equal(first.faces.length, 18);
  const none = mergeAnswers([]);
  assert.equal(none.mesh, null);
  assert.equal(none.bodies, null);
});

test("an answer put together owns its buffers: sending one (giving its buffers away) does not spoil the pieces, which are put together again", () => {
  const g = graphFor(projectText(30));
  const plan = planPieces(g)!;
  const answers = plan.pieces.slice(0, 5).map((p) => kernel.evaluate(p.graph));
  const a = mergeAnswers(answers);
  const detach = (r: ReturnType<typeof mergeAnswers>) => { for (const e of r.edges ?? []) structuredClone(e.pts, { transfer: [e.pts.buffer] }); for (const b of [r.mesh!.vertices, r.mesh!.normals, r.mesh!.triangles]) structuredClone(b, { transfer: [b.buffer] }); };
  detach(a);
  const b = mergeAnswers(answers); // (the pieces' own arrays are still whole)
  assert.ok(b.mesh!.vertices.byteLength > 0, "the mesh");
  assert.ok(b.edges!.length > 0 && b.edges!.every((e) => e.pts.byteLength > 0), `${b.edges!.length} edges, ${b.edges!.filter((e) => e.pts.byteLength === 0).length} with no points`);
});
