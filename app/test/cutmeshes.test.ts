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
