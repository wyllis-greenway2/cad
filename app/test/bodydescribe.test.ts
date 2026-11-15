// Each body is described on its own and the descriptions are joined (`in_446`): the faces' triangle ranges and the triangles' vertex numbers stay right when there are several bodies, and a body that did not change
// is the same whatever happens to the others.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";

await kernel.init();
const box = (id: string, x: number, w: number, extra: Record<string, unknown> = {}) => [
  { id: `s_${id}`, type: "sketch", shape: "polygon", points: [[x, 0], [x + w, 0], [x + w, 10], [x, 10]], plane: "XY", origin: 0 },
  { id: `x_${id}`, type: "extrude", profile: `s_${id}`, distance: 10, ...extra },
];
const graph = (w2: number) => ({ params: {}, ops: [...box("a", 0, 10), ...box("b", 20, w2, { target: "x_a", mode: "new" })] });

test("two bodies: every face range lies inside the joined mesh and no two overlap, each triangle names a vertex that exists, and the bodies are tagged", () => {
  const r = kernel.evaluate(graph(6) as never) as unknown as { mesh: { vertices: Float32Array; triangles: Uint32Array }; faces: { start: number; count: number; body?: number; ranges?: { start: number; count: number }[] }[]; bodies: { id: string; volume: number }[]; volume: number; bbox: { min: number[]; max: number[] } };
  const nV = r.mesh.vertices.length / 3;
  assert.ok(r.mesh.triangles.every((i) => i < nV), "every triangle names a vertex");
  const spans = r.faces.flatMap((f) => (f.ranges ?? [{ start: f.start, count: f.count }]));
  assert.ok(spans.every((s) => s.start >= 0 && s.start + s.count <= r.mesh.triangles.length));
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  sorted.forEach((s, i) => { if (i) assert.ok(s.start >= sorted[i - 1]!.start + sorted[i - 1]!.count, "ranges do not overlap"); });
  assert.deepEqual([...new Set(r.faces.map((f) => f.body))].sort(), [0, 1]);
  assert.equal(r.bodies.length, 2);
  assert.ok(Math.abs(r.volume - (1000 + 600)) < 1e-3);
  assert.deepEqual(r.bbox.min.map((v) => Math.round(v)), [0, 0, 0]);
  assert.deepEqual(r.bbox.max.map((v) => Math.round(v)), [26, 10, 10]);
});

test("the second body made wider: the first is described just as before", () => {
  const a = kernel.evaluate(graph(6) as never) as unknown as { faces: { n?: number[]; d?: number; body?: number }[] };
  const b = kernel.evaluate(graph(8) as never) as unknown as { faces: { n?: number[]; d?: number; body?: number }[]; volume: number };
  const first = (r: { faces: { n?: number[]; d?: number; body?: number }[] }) => r.faces.filter((f) => f.body === 0).map((f) => JSON.stringify([f.n, f.d]));
  assert.deepEqual(first(a), first(b));
  assert.ok(Math.abs(b.volume - (1000 + 800)) < 1e-3);
});

test("pulling a face of one of two bodies changes that body alone (the boolean is made on it, not on both), and a pull that reaches the other joins them", () => {
  const ops = (d: number) => ({ params: {}, ops: [...graph(6).ops, { id: "p", type: "faceExtrude", target: "x_b", ref: { axis: 2, sign: 1, offset: 10, point: [23, 5, 10] }, distance: d }] });
  const apart = kernel.evaluate(ops(4) as never) as unknown as { volume: number; bodies: unknown[]; ops: { id: string; error: string | null }[] };
  assert.equal(apart.ops.find((o) => o.id === "p")!.error, null);
  assert.equal(apart.bodies.length, 2);
  assert.ok(Math.abs(apart.volume - (1000 + 6 * 10 * 14)) < 1e-3, `volume ${apart.volume}`);
});
