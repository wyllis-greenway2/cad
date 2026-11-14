// The lite answer of the kernel (`in_327`): the mesh, volume and box of a size being dragged, without the faces, edges and corners, which take about half the time of a preview and which a preview does not use.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import { openSession, previewCommand } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { KernelGraph } from "../src/compiler/kernel/adapter.ts";

await kernel.init();
const open = (): Session => (openSession(kernel, readFileSync(new URL("./fixtures/two-blocks-in_319.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const EDGE = "b/body/e@29.78,10.89,0~29.78,10.89,12.4~29.78,10.89,6.2";
const fillet = (s: Session, v: number) => previewCommand(s, { type: "addStep", step: { id: "s_990", type: "edgeMod", parts: [EDGE as never], params: { mode: "fillet", value: v } } })!;

test("a lite answer has the same mesh, volume and box as the whole one, and no faces, edges or corners", () => {
  const s = open();
  const whole = fillet(s, 1.3).outcome.kernel!;
  kernel.lite = true;
  let lite;
  try { lite = fillet(s, 1.31).outcome.kernel!; } finally { kernel.lite = false; }
  assert.ok(whole.faces!.length > 0 && whole.edges!.length > 0, "the whole one has them");
  assert.deepEqual([lite.faces, lite.edges, lite.vertices], [[], [], []]);
  assert.ok(Math.abs(lite.volume! - whole.volume!) < 0.5, "the volume is a fillet's worth the same");
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(lite.bbox!.min[j]! - whole.bbox!.min[j]!) < 0.01 && Math.abs(lite.bbox!.max[j]! - whole.bbox!.max[j]!) < 0.01);
  assert.ok(lite.mesh!.triangles.length > 0);
  assert.deepEqual(lite.bodies!.map((b) => b.id), whole.bodies!.map((b) => b.id), "the same bodies");
  assert.ok(lite.bodies!.every((b) => Number.isNaN(b.volume)), "the volume of each of several bodies is not worked out");
});

test("the whole answer after a lite one is not taken from it", () => {
  const s = open();
  kernel.lite = true;
  try { fillet(s, 1.4); } finally { kernel.lite = false; }
  const whole = fillet(s, 1.4).outcome.kernel!;
  assert.ok(whole.faces!.length > 0, "asked for whole, answered whole");
});

test("the async kernel asks for lite and whole apart and passes the flag to the worker", () => {
  const sent: { graph: KernelGraph; draft?: boolean; lite?: boolean }[] = [];
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = { postMessage: (m) => { sent.push(m as never); }, addEventListener: (t, f) => { if (t === "message") { listeners.push(f); f({ data: { ready: true } }); } } };
  const k = createAsyncKernel(() => {}, worker);
  const graph = { ops: [] } as unknown as KernelGraph;
  k.lite = true;
  k.evaluate(graph);
  assert.equal(sent.at(-1)?.lite, true, "the flag goes to the worker");
  k.lite = false;
  k.evaluate(graph); // (the same graph, not lite: a request of its own, queued behind the one that is out)
  const answer = (id: number) => { for (const f of listeners) f({ data: { id, result: { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 } } }); };
  answer(1);
  assert.equal(sent.length, 2, "the whole one was asked for too, not taken for the lite one");
  assert.equal(sent.at(-1)?.lite, false);
});
