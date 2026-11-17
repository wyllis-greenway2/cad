// Picking a body's face asks the ray of its triangles with plain numbers and a box found once; the nearest hit is the one the plain way finds (`in_784`).
import test from "node:test";
import assert from "node:assert/strict";
import { depthOf } from "../src/operation/part.ts";
import type { Part } from "../src/operation/part.ts";
import type { Vec3 } from "../src/math/vec.ts";

function rng(seed: number) { let x = seed; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; }
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function reference(m: number[], o: Vec3, d: Vec3): number | null {
  let best: number | null = null;
  for (let i = 0; i + 8 < m.length; i += 9) {
    const a: Vec3 = [m[i]!, m[i + 1]!, m[i + 2]!], b: Vec3 = [m[i + 3]!, m[i + 4]!, m[i + 5]!], c: Vec3 = [m[i + 6]!, m[i + 7]!, m[i + 8]!];
    const [e1, e2] = [sub(b, a), sub(c, a)];
    const h = cross(d, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, s = sub(o, a), u = f * dot(s, h);
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = f * dot(d, q);
    if (v < 0 || u + v > 1) continue;
    const t = f * dot(e2, q);
    if (t > 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

test("the nearest triangle a ray meets is the one the plain way finds, for rays that meet and rays that miss", () => {
  const r = rng(11);
  // a bumpy sheet of a thousand triangles
  const m: number[] = [];
  const at = (i: number, j: number): Vec3 => [i, j, Math.sin(i * 0.7) * Math.cos(j * 0.5) * 2];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (const p of [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]) m.push(...p);
  const part = { ref: "b/body/f@0,0,1,0", kind: "plane", origin: "body", plane: null, movable: false, at: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], mesh: m } as unknown as Part;
  let hit = 0, miss = 0;
  for (let k = 0; k < 500; k++) {
    const o: Vec3 = [r() * 30 - 5, r() * 30 - 5, 5 + r() * 20];
    const d0: Vec3 = [(r() - 0.5) * 0.6, (r() - 0.5) * 0.6, -1];
    const l = Math.hypot(...d0);
    const d: Vec3 = [d0[0] / l, d0[1] / l, d0[2] / l];
    const got = depthOf(() => undefined, part, { x: 0, y: 0, project: () => [0, 0], ray: { o, d } } as never);
    const want = reference(m, o, d);
    if (want === null) { assert.equal(got, null, `ray ${k}`); miss++; } else { assert.ok(got !== null && Math.abs(got - want) < 1e-9, `ray ${k}: ${got} against ${want}`); hit++; }
  }
  assert.ok(hit > 100 && miss > 100, `${hit} hits, ${miss} misses`);
});
