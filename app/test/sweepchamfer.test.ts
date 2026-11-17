// A chamfer of the long edges of a swept body that the kernel cannot make, made as a region (`in_653`, `in_655`): a rectangle swept along two tangent arcs, eight edges chamfered. The pieces of a rim that meet at a kink
// are cut by the plane that halves it, and the ends against a cap by the cap's plane, so no wedge end is left standing (twelve flat triangles of half the size squared were).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run, undoLast } from "../src/interaction/session.ts";

await kernel.init();
const open = () => { const r = openSession(kernel, readFileSync(new URL("./fixtures/sweep-chamfer-in_653.cad.json", import.meta.url), "utf8")); assert.ok(r.ok); return r.value; };
type K = { volume: number; faces: { start: number; count: number; n?: number[]; d?: number }[]; mesh: { vertices: Float32Array; triangles: Uint32Array } };
const area = (k: K, f: K["faces"][number]): number => {
  let a = 0;
  for (let i = f.start; i < f.start + f.count; i += 3) {
    const [p, q, s] = [0, 1, 2].map((j) => k.mesh.triangles[i + j]! * 3);
    const u = [0, 1, 2].map((c) => k.mesh.vertices[q! + c]! - k.mesh.vertices[p! + c]!), w = [0, 1, 2].map((c) => k.mesh.vertices[s! + c]! - k.mesh.vertices[p! + c]!);
    a += Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!) / 2;
  }
  return a;
};

test("the eight long edges of a swept bend chamfered: the material taken is the chamfer's (a quarter-square of the size times the edges' length, at every size), no wedge end is left standing, and every corner of the end is cut", () => {
  const s = open();
  const ch = scene(s).steps.find((x) => x.type === "edgeMod")!;
  const base = (undoLast(s).outcome.kernel as unknown as K).volume;
  const per: number[] = [];
  for (const v of [1, 2, 3, 4, 5.1, 6]) {
    const t = run(undoLast(s), { type: "addStep", step: { ...ch, id: "s_900", params: { ...ch.params, value: v } } } as never);
    assert.deepEqual(t.outcome.errors, {}, `size ${v}`);
    const k = t.outcome.kernel as unknown as K;
    per.push((base - k.volume) / (v * v));
    // no flat face the size of the end triangle of a wedge (half the size squared): the pieces end on planes they share
    const wedge = k.faces.filter((f) => f.n && Math.abs(area(k, f) - (v * v) / 2) < 0.1 * (v * v) / 2 && area(k, f) > 2);
    assert.equal(wedge.length, 0, `size ${v}: ${wedge.length} wedge ends left`);
    // the bottom end of the bend (z = 0): its four corners are cut, each by a triangle of about half the size squared
    const cap = k.faces.find((f) => f.n && Math.abs(f.n[2]! + 1) < 1e-6 && Math.abs(f.d!) < 1e-6)!;
    const full = 15.55 * 13.84;
    assert.ok(Math.abs(area(k, cap) - (full - 2 * v * v)) < 0.03 * full, `size ${v}: the end face is ${area(k, cap).toFixed(1)}, with four corners cut about ${(full - 2 * v * v).toFixed(1)}`);
  }
  // the material taken goes as the square of the size: the same number for every size, to a hundredth
  const mean = per.reduce((a, b) => a + b, 0) / per.length;
  assert.ok(per.every((x) => Math.abs(x - mean) < 0.01 * mean), `taken per size squared: ${per.map((x) => x.toFixed(2)).join(", ")}`);
});
