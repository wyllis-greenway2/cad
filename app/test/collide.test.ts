// Hard bodies' geometry (`dec_hard_bodies`): the collision of two triangle meshes and how far a motion may go.
import test from "node:test";
import assert from "node:assert/strict";
import { buildTree, collides, collidesMoving, moved, partOf, freePart } from "../src/operation/collide.ts";
import type { Rigid } from "../src/operation/frames.ts";
import { applyPoint } from "../src/operation/frames.ts";
import type { Vec3 } from "../src/math/vec.ts";

/** The 12 triangles of the box. */
function box(lo: Vec3, hi: Vec3): number[] {
  const [x0, y0, z0, x1, y1, z1] = [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]];
  const c = (i: number): Vec3 => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  return quads.flatMap(([a, b, c2, d]) => [...c(a!), ...c(b!), ...c(c2!), ...c(a!), ...c(c2!), ...c(d!)]);
}
const shift = (v: Vec3): Rigid => ({ turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift: v, k: 1 });

test("boxes that cross collide; boxes apart, and boxes that only touch by a face, do not", () => {
  const fixed = buildTree(box([0, 0, 0], [10, 10, 10]));
  assert.equal(collides(box([5, 5, 5], [15, 15, 15]), fixed), true, "crossing");
  assert.equal(collides(box([20, 0, 0], [30, 10, 10]), fixed), false, "apart");
  assert.equal(collides(box([10, 0, 0], [20, 10, 10]), fixed), false, "a face on a face");
  assert.equal(collides(box([10, 2, 2], [20, 5, 5]), fixed), false, "a block standing on a face");
  assert.equal(collides(box([2, 2, 2], [4, 4, 4]), fixed), true, "wholly inside");
  assert.equal(collides(box([-5, -5, -5], [15, 15, 15]), fixed), true, "wholly round it");
});

test("with a clearance, nearer than it counts: a gap of 0.3 is a collision at clearance 0.5 and not at 0.2; a face on a face is a collision at any clearance", () => {
  const fixed = buildTree(box([0, 0, 0], [10, 10, 10]));
  const gap = box([10.3, 0, 0], [20, 10, 10]);
  assert.equal(collides(gap, fixed, 0.5), true);
  assert.equal(collides(gap, fixed, 0.2), false);
  assert.equal(collides(gap, fixed, 0), false);
  assert.equal(collides(box([10, 0, 0], [20, 10, 10]), fixed, 0.2), true);
});

test("how far a motion goes: a box slid at another stops where they meet, even through a thin wall; one that goes clear goes the whole way", () => {
  const wall = buildTree(box([20, 0, 0], [20.2, 10, 10]));
  const mover = box([0, 0, 0], [10, 10, 10]);
  const slide = shift([40, 0, 0]);
  const t = freePart((p) => collides(moved(mover, partOf(slide, p)), wall));
  assert.ok(Math.abs(t * 40 - 10) < 0.05, `it stops with its face on the wall: ${t * 40}`);
  const clear = freePart((p) => collides(moved(mover, partOf(shift([0, 30, 0]), p)), wall));
  assert.equal(clear, 1);
});

test("a part of a turn about a point is the turn of that part of the angle about the same point", () => {
  const c: Vec3 = [5, 3, 0];
  const a = Math.PI / 2; // a quarter turn about Z through c
  const R: Rigid["turn"] = [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
  const whole: Rigid = { turn: R, shift: [c[0] - (R[0] * c[0] + R[1] * c[1]), c[1] - (R[3] * c[0] + R[4] * c[1]), 0], k: 1 };
  const half = partOf(whole, 0.5);
  const p: Vec3 = [8, 3, 2];
  const q = applyPoint(half, p);
  const th = a / 2;
  const want: Vec3 = [c[0] + Math.cos(th) * (p[0] - c[0]) - Math.sin(th) * (p[1] - c[1]), c[1] + Math.sin(th) * (p[0] - c[0]) + Math.cos(th) * (p[1] - c[1]), 2];
  assert.ok(Math.hypot(q[0] - want[0], q[1] - want[1], q[2] - want[2]) < 1e-9, `${q} vs ${want}`);
  const all = applyPoint(partOf(whole, 1), p);
  const exact = applyPoint(whole, p);
  assert.ok(Math.hypot(all[0] - exact[0], all[1] - exact[1], all[2] - exact[2]) < 1e-9);
});

/** a flat layer of n x n small cubes, each its own closed surface, 1 mm apart (a heavy body) */
function lattice(n: number, at: Vec3): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(...box([at[0] + 2 * i, at[1] + 2 * j, at[2]], [at[0] + 2 * i + 1, at[1] + 2 * j + 1, at[2] + 1]));
  return out;
}

test("walking the tree of the moving body gives what moving every triangle gives (`in_479`): moves, turns, clearances, inside and round", () => {
  const stays = buildTree(box([0, 0, 0], [10, 10, 10]));
  const body = box([0, 0, 0], [4, 3, 2]);
  const mine = buildTree(body);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let hits = 0;
  for (let n = 0; n < 400; n++) {
    const a = rnd() * 6.283, c = Math.cos(a), s = Math.sin(a);
    const r: Rigid = n % 3 === 0 ? shift([rnd() * 24 - 12, rnd() * 24 - 12, rnd() * 24 - 12]) : { turn: [c, -s, 0, s, c, 0, 0, 0, 1], shift: [rnd() * 20 - 5, rnd() * 20 - 5, rnd() * 20 - 5], k: 1 };
    for (const clearance of [0, 0.7]) {
      const want = collides(moved(body, r), stays, clearance);
      assert.equal(collidesMoving(mine, r, stays, clearance), want, `case ${n} clearance ${clearance}`);
      if (want) hits++;
    }
  }
  assert.ok(hits > 40 && hits < 700, `a mix of hits and misses (${hits})`);
  // wholly inside, wholly round it, and the same open
  assert.equal(collidesMoving(buildTree(box([0, 0, 0], [2, 2, 2])), shift([4, 4, 4]), stays), true, "inside");
  assert.equal(collidesMoving(buildTree(box([0, 0, 0], [30, 30, 30])), shift([-10, -10, -10]), stays), true, "round");
});

test("a heavy moving body is much quicker walked than moved whole (`in_479`)", () => {
  const stays = buildTree([...lattice(40, [0.5, 0.5, -1]), ...lattice(40, [0.5, 0.5, 4])]); // two layers of cubes with a gap between (as heavy as the moving one)
  const heavy = lattice(40, [0, 0, 0]); // 1600 cubes, 19200 triangles
  const mine = buildTree(heavy);
  const r = shift([0, 0, 2]); // in the gap, touching nothing, the boxes still overlap
  assert.equal(collidesMoving(mine, r, stays), false);
  assert.equal(collides(moved(heavy, r), stays), false);
  const time = (f: () => void) => { let best = Infinity; for (let k = 0; k < 6; k++) { const t0 = performance.now(); for (let i = 0; i < 4; i++) f(); best = Math.min(best, performance.now() - t0); } return best; }; // (the best of several, a busy machine slows a run, not every one)
  const whole = time(() => collides(moved(heavy, r), stays));
  const walked = time(() => collidesMoving(mine, r, stays));
  assert.ok(walked < whole, `walked ${walked.toFixed(1)} ms, whole ${whole.toFixed(1)} ms`);
});
