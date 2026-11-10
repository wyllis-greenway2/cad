// Independent bodies in the kernel (`dec_independent_bodies`, `in_270`): a compound of solids that stand alone is several bodies, each with a name that survives the history.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import type { KernelGraph } from "../src/compiler/kernel/adapter.ts";

await kernel.init();
const rect = (id: string, x: number, y: number, w: number, d: number) => ({ id: `s_${id}`, type: "sketch", plane: "XY", origin: 0, shape: "rect", w, d, at: [x, y] });
const add = (id: string, target: string | null, depth = 10) => ({ id: `x_${id}`, type: "extrude", profile: `s_${id}`, distance: depth, mode: "add", ...(target ? { target } : {}) });

const two = (): KernelGraph => ({ params: {}, ops: [rect("a", 5, 5, 10, 10), add("a", null), rect("b", 35, 5, 10, 10), add("b", "x_a")] } as unknown as KernelGraph);

test("two pieces that do not touch are two bodies, each with a name, a box and a volume; the faces and edges say which body they are in", () => {
  const r = kernel.evaluate(two());
  assert.equal(r.bodies?.length, 2);
  assert.deepEqual(r.bodies!.map((b) => b.id), ["x_a", "x_b"]);
  assert.ok(r.bodies!.every((b) => Math.abs(b.volume - 1000) < 1e-6));
  assert.ok(r.bodies![0]!.max[0] <= 10 + 1e-6 && r.bodies![1]!.min[0] >= 30 - 1e-6);
  const owners = new Set(r.faces!.map((f) => f.body));
  assert.deepEqual([...owners].sort(), [0, 1]);
  assert.deepEqual([...new Set(r.edges!.map((e) => e.body))].sort(), [0, 1]);
});

test("a piece that touches the body joins it (one body); a single body has one", () => {
  const g = { params: {}, ops: [rect("a", 5, 5, 10, 10), add("a", null), rect("b", 15, 5, 10, 10), add("b", "x_a")] } as unknown as KernelGraph;
  const r = kernel.evaluate(g);
  assert.equal(r.bodies?.length, 1);
  assert.equal(r.bodies![0]!.id, "x_a", "the older name");
});

test("moving one body moves only that one, and the names follow the bodies", () => {
  const g = two();
  g.ops.push({ id: "m", type: "transform", target: "x_b", mode: "move", axis: 1, value: 50, body: "x_b" } as never);
  const r = kernel.evaluate(g);
  assert.deepEqual(r.bodies!.map((b) => b.id), ["x_a", "x_b"]);
  assert.ok(Math.abs(r.bodies![0]!.min[1]) < 1e-6, "a stays");
  assert.ok(Math.abs(r.bodies![1]!.min[1] - 50) < 1e-6, "b moved");
  // moved onto a: it stays a body of its own (overlapping), and the names are kept
  g.ops.push({ id: "m2", type: "transform", target: "m", mode: "move", axis: 1, value: -50, body: "x_b" } as never);
  g.ops.push({ id: "m3", type: "transform", target: "m2", mode: "move", axis: 0, value: -25, body: "x_b" } as never);
  const r3 = kernel.evaluate(g);
  assert.equal(r3.bodies!.length, 2, "overlapping bodies stay two");
  assert.deepEqual(r3.bodies!.map((b) => b.id), ["x_a", "x_b"]);
});

test("a face pulled out of one body goes on through another without joining it (`in_270`)", () => {
  const g = two();
  const ref = { axis: 0, sign: 1, offset: 10, point: [10, 5, 5] };
  g.ops.push({ id: "p", type: "faceExtrude", target: "x_b", ref, distance: 5 } as never); // a's +x face pulled out 5 mm: no contact with b yet
  const r = kernel.evaluate(g);
  assert.equal(r.bodies!.length, 2);
  const g2 = two();
  g2.ops.push({ id: "p", type: "faceExtrude", target: "x_b", ref, distance: 25 } as never); // reaches b (x 30 to 40) and goes into it
  const r2 = kernel.evaluate(g2);
  assert.equal(r2.bodies!.length, 2, "still two bodies: it did not join b");
  assert.ok(Math.abs(r2.bodies![0]!.max[0] - 35) < 1e-6);
});

test("Add joins bodies that touch or overlap into the first; apart they cannot; Subtract takes the others away and uses them up", () => {
  const near = { params: {}, ops: [rect("a", 5, 5, 10, 10), add("a", null), rect("b", 35, 5, 10, 10), add("b", "x_a"), { id: "m", type: "transform", target: "x_b", mode: "move", axis: 0, value: -25, body: "x_b" }] } as unknown as KernelGraph; // b now overlaps a
  const joined = kernel.evaluate({ ...near, ops: [...near.ops, { id: "c", type: "combine", target: "m", mode: "add", bodies: ["x_a", "x_b"] }] } as never);
  assert.equal(joined.bodies!.length, 1);
  assert.equal(joined.bodies![0]!.id, "x_a");
  const apart = kernel.evaluate({ ...two(), ops: [...two().ops, { id: "c", type: "combine", target: "x_b", mode: "add", bodies: ["x_a", "x_b"] }] } as never);
  assert.match(apart.ops.find((o) => o.id === "c")!.error ?? "", /do not touch or overlap/);
  const cut = kernel.evaluate({ ...near, ops: [...near.ops, { id: "c", type: "combine", target: "m", mode: "subtract", bodies: ["x_a", "x_b"] }] } as never);
  assert.equal(cut.bodies!.length, 1);
  assert.ok(cut.volume! < 1000 - 1, `a with b taken out of it: ${cut.volume}`);
  const reversed = kernel.evaluate({ ...near, ops: [...near.ops, { id: "c", type: "combine", target: "m", mode: "subtract", bodies: ["x_b", "x_a"] }] } as never);
  assert.equal(reversed.bodies![0]!.id, "x_b", "the first stays, whichever it is");
});

test("Intersect keeps what the bodies share; keeping the tools leaves them as bodies of their own", () => {
  const near = { params: {}, ops: [rect("a", 5, 5, 10, 10), add("a", null), rect("b", 35, 5, 10, 10), add("b", "x_a"), { id: "m", type: "transform", target: "x_b", mode: "move", axis: 0, value: -25, body: "x_b" }] } as unknown as KernelGraph; // b overlaps a over 5 x 10 x 10
  const inter = kernel.evaluate({ ...near, ops: [...near.ops, { id: "c", type: "combine", target: "m", mode: "intersect", bodies: ["x_a", "x_b"] }] } as never);
  assert.equal(inter.bodies!.length, 1);
  assert.ok(Math.abs(inter.volume! - 500) < 1e-6, `${inter.volume}`);
  const keep = kernel.evaluate({ ...near, ops: [...near.ops, { id: "c", type: "combine", target: "m", mode: "subtract", bodies: ["x_a", "x_b"], keep: 1 }] } as never);
  assert.deepEqual(keep.bodies!.map((b) => b.id).sort(), ["x_a", "x_b"], "the tool is still a body");
  assert.ok(Math.abs(keep.bodies!.find((b) => b.id === "x_a")!.volume - 500) < 1e-6, "a lost the shared half");
  assert.ok(Math.abs(keep.bodies!.find((b) => b.id === "x_b")!.volume - 1000) < 1e-6, "b is whole");
  const none = kernel.evaluate({ ...two(), ops: [...two().ops, { id: "c", type: "combine", target: "x_b", mode: "intersect", bodies: ["x_a", "x_b"] }] } as never);
  assert.match(none.ops.find((o) => o.id === "c")!.error ?? "", /nothing in common/);
});
