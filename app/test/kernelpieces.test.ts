// A model of many parts apart is made in pieces, with the answer so far sent as it goes, and stopped when the page asks (`dec_progressive_open`, `in_1002`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { graphOf } from "../src/compiler/compile.ts";
import { evaluateInPieces } from "../src/kernel-pieces.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { Kernel, KernelGraph, KernelResult } from "../src/compiler/kernel/adapter.ts";
import { projectText } from "./pieceshelp.ts";

await kernel.init();
const EMPTY = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const nokernel = { name: "none", init: async () => ({}), evaluate: () => ({ ...EMPTY, stale: true }) as never, exportMesh: async () => ({ ok: false, error: "no" }), exportStep: async () => ({ ok: false, error: "no" }), lagging: true } as unknown as Kernel;
const graphFor = (n: number): KernelGraph => { const r = openSession(nokernel, projectText(n)); assert.ok(r.ok); return { ...graphOf(scene(r.value)), names: true } as KernelGraph; };

test("the pieces are made nearest the eye first, the first at once and the rest as it goes, and the whole answer is the whole's", async () => {
  const g = graphFor(30);
  const partials: KernelResult[] = [];
  let clock = 0;
  const r = await evaluateInPieces(kernel, g, [0, 0, 0], { partial: (x) => partials.push(x), stopped: () => false, yieldNow: async () => { clock += 500; }, now: () => (clock += 120) });
  assert.ok(r && r !== "stopped");
  assert.ok(partials.length >= 2, `${partials.length} answers so far`);
  assert.equal(partials[0]!.partial!.done, 1, "the first part at once");
  assert.ok(partials.every((p, i) => i === 0 || p.partial!.done > partials[i - 1]!.partial!.done));
  assert.equal(partials[0]!.bodies!.length, 1);
  const whole = kernel.evaluate(g) as unknown as { volume: number; bodies: unknown[] };
  assert.equal((r as KernelResult).bodies!.length, whole.bodies.length);
  assert.ok(Math.abs((r as KernelResult).volume! - whole.volume) < 1e-6);
  assert.equal((r as KernelResult).partial, undefined, "the last answer is not partial");
  // the nearest first: the first part made is the one nearest the eye
  const first = partials[0]!.bodies![0]!;
  const dist = (b: { min: number[]; max: number[] }) => Math.hypot((b.min[0]! + b.max[0]!) / 2, (b.min[1]! + b.max[1]!) / 2);
  assert.ok((r as KernelResult).bodies!.every((b) => dist(first as never) <= dist(b as never) + 1e-6), "the nearest first");
});

test("it stops when the page asks, and a graph of another kind is left to be made whole", async () => {
  const g = graphFor(30);
  let asked = false;
  const r = await evaluateInPieces(kernel, g, undefined, { partial: () => { asked = true; }, stopped: () => asked, yieldNow: async () => {}, now: () => 0 });
  assert.equal(r, "stopped");
  const few = graphFor(5);
  assert.equal(await evaluateInPieces(kernel, few, undefined, { partial: () => {}, stopped: () => false, yieldNow: async () => {}, now: () => 0 }), null);
});

function fakeWorker() {
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const posted: Record<string, unknown>[] = [];
  const w: WorkerLike = { postMessage: (m) => { posted.push(m as Record<string, unknown>); }, addEventListener: (t, f) => { if (t === "message") listeners.push(f); }, terminate: () => {} };
  return { w, posted, say: (data: unknown) => { for (const f of listeners) f({ data }); } };
}
const mesh = () => ({ vertices: new Float32Array(9), normals: new Float32Array(9), triangles: new Uint32Array(3) });

test("the page shows the parts made so far while the job goes on, asks it to stop for a newer question, and goes on with that", async () => {
  const f = fakeWorker();
  let changed = 0;
  const k = createAsyncKernel(() => changed++, f.w, { limitMs: 100000 });
  f.say({ ready: true });
  await k.init();
  const g1 = graphFor(2), g2 = graphFor(3);
  k.eye = [1, 2, 3];
  assert.equal(k.evaluate(g1).stale, true);
  const id1 = f.posted[0]!.id as number;
  assert.deepEqual(f.posted[0]!.eye, [1, 2, 3], "the eye goes with the job");
  f.say({ id: id1, partial: true, result: { ...EMPTY, mesh: mesh(), bodies: [{ id: "x_s_002", min: [0, 0, 0], max: [1, 1, 1], volume: 1 }], partial: { done: 1, total: 9 } } });
  const shown = k.evaluate(g1);
  assert.equal(shown.stale, true);
  assert.equal(shown.partial?.done, 1);
  assert.equal(shown.bodies?.length, 1, "the part made is the picture");
  assert.ok(changed >= 1);
  assert.equal(f.posted.length, 1, "the job goes on: nothing else is posted");
  // a newer question: the job is asked to stop, once
  k.evaluate(g2); k.evaluate(g2);
  assert.deepEqual(f.posted.slice(1).map((m) => m.cancel), [id1], "asked to stop, once");
  f.say({ id: id1, cancelled: true });
  assert.equal(f.posted.length, 3, "and the newer question is posted");
  assert.ok(f.posted[2]!.graph);
  assert.equal(k.evaluate(g2).stale, true);
  assert.equal(k.evaluate(g2).bodies?.length, 1, "the parts made stay on the screen meanwhile");
});

test("each answer so far is a sign that the job is alive: a job made of pieces is not stopped at the limit while they come", async () => {
  const f = fakeWorker();
  let stopped = 0;
  f.w.terminate = () => { stopped++; };
  const k = createAsyncKernel(() => {}, f.w, { limitMs: 50, respawn: () => fakeWorker().w });
  f.say({ ready: true });
  await k.init();
  k.evaluate(graphFor(2));
  const id = f.posted[0]!.id as number;
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f.say({ id, partial: true, result: { ...EMPTY, mesh: mesh(), bodies: [], partial: { done: i + 1, total: 9 } } }); }
  assert.equal(stopped, 0, "120 ms of work in a limit of 50, not stopped");
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(stopped, 1, "and stopped when they stop coming");
});
