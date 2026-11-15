// A fillet or chamfer of a straight edge between two flat faces has no size that fails (`in_386`, `dec_edits_saturate` B): where the kernel's rolling fillet cannot be made the corner is made as a region that is cut
// (a convex edge) or added (a concave one), and past the size where the rounding stops touching the faces next to it, it crosses them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run, createSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawChain, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
const block = () => (openSession(kernel, readFileSync(new URL("./fixtures/block-fillet-in_386.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const vol = (s: Session) => s.outcome.kernel!.volume!;
const set = (s: Session, params: Record<string, unknown>) => run(s, { type: "setStepParams", id: "s_014", params } as never);

// the block is 13.51 x 13.14 across and 17.9 high; the edge rounded is its vertical edge at (29.7, 8.37)
const [X0, X1, Y0, Y1, Hh] = [16.19, 29.7, 8.37, 21.51, 17.9];
/** the area of the block's section kept when the corner at (X1, Y0) is rounded by r (fillet) or cut off at distance r along both faces (chamfer), found by counting points */
function kept(mode: "fillet" | "chamfer", r: number): number {
  const n = 1500;
  let k = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = X0 + ((i + 0.5) * (X1 - X0)) / n;
    const y = Y0 + ((j + 0.5) * (Y1 - Y0)) / n;
    const inside = mode === "fillet"
      ? x <= X1 - r || y >= Y0 + r || Math.hypot(x - (X1 - r), y - (Y0 + r)) <= r
      : (X1 - x) + (y - Y0) >= r;
    if (inside) k++;
  }
  return (k / (n * n)) * (X1 - X0) * (Y1 - Y0);
}

for (const r of [10, 13.14, 13.2, 14, 20]) {
  test(`a vertical fillet of ${r} mm on the block is made, and is the corner rounded by that circle where the circle meets the faces`, () => {
    const s = set(block(), { value: r });
    assert.deepEqual(s.outcome.errors, {});
    const want = kept("fillet", r) * Hh;
    assert.ok(Math.abs(vol(s) - want) / want < 0.004, `volume ${vol(s).toFixed(1)}, the rounded block ${want.toFixed(1)}`);
    if (r > 13.14) assert.match(Object.values(s.outcome.notes ?? {}).join(" "), /could not be made as a smooth round/, "said when it crosses the faces");
  });
}

for (const d of [3, 13, 20]) {
  test(`a vertical chamfer of ${d} mm on the block is made as the corner cut off at that distance along both faces`, () => {
    const s = set(block(), { mode: "chamfer", value: d });
    assert.deepEqual(s.outcome.errors, {});
    const want = kept("chamfer", d) * Hh;
    assert.ok(Math.abs(vol(s) - want) / want < 0.004, `volume ${vol(s).toFixed(1)}, the cut block ${want.toFixed(1)}`);
  });
}

test("a size that would take all of the body is refused, and says so", () => {
  for (const params of [{ value: 100 }, { mode: "chamfer", value: 50 }]) {
    const s = set(block(), params);
    assert.match(Object.values(s.outcome.errors).join(" "), /would take all of the body/);
  }
});

test("a concave edge is filled as a region: the inside corner of an L-shaped body", () => {
  let s = createSession(kernel);
  const L = drawChain(scene(s), XY, [[0, 0, 0], [20, 0, 0], [20, 10, 0], [10, 10, 0], [10, 20, 0], [0, 20, 0]], true);
  s = run(s, L.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: L.lines, params: { depth: 10 } } });
  assert.deepEqual(s.outcome.errors, {});
  const before = vol(s);
  assert.ok(Math.abs(before - 300 * 10) < 1e-3);
  // the inside corner at (10, 10) is the one concave vertical edge
  const edge = (Object.values(scene(s).parts) as Part[]).find((p) => p.kind === "line" && p.origin === "body" && (() => {
    const [a, b] = [scene(s).parts[p.a] as unknown as { at: number[] }, scene(s).parts[p.b] as unknown as { at: number[] }];
    return Math.abs(a.at[0]! - 10) < 1e-6 && Math.abs(a.at[1]! - 10) < 1e-6 && a.at[2] !== b.at[2];
  })())!;
  for (const r of [2, 8, 30]) {
    const done = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "edgeMod", parts: [edge.ref], params: { mode: "fillet", value: r } } });
    assert.deepEqual(done.outcome.errors, {}, `r ${r}`);
    // the region added is the corner between the two walls and the rounding, up to where the rounding touches the walls (the walls end 10 mm from the corner): r > 10 crosses them
    const added = (vol(done) - before) / 10;
    if (r <= 10) assert.ok(Math.abs(added - r * r * (1 - Math.PI / 4)) < 0.02, `r ${r}: added ${added.toFixed(3)} of ${(r * r * (1 - Math.PI / 4)).toFixed(3)}`);
    else assert.ok(Math.abs(added - 10 * 10 * (1 - Math.PI / 4)) < 0.02, `r ${r}: the corner is filled as far as the walls go (${added.toFixed(2)})`);
  }
});

/** A post of radius 10 and height 20, and its rim at the top (z = 20) or at the foot (z = 0) */
function post() {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 20 } } });
  // the rim is two half circles, as the kernel makes it: both are chosen, as the tool chooses them
  const rim = (z: number) => (Object.values(scene(s).parts) as Part[]).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && !!p.circle && Math.abs(p.circle.center[2] - z) < 1e-6).map((p) => p.ref);
  return { s, rim };
}
/** the volume of the post with the top rim rounded by a circle of radius r (r <= 10), by adding up the rings */
function roundedPost(r: number): number {
  const n = 20000;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const rho = ((i + 0.5) * 10) / n;
    const top = rho > 10 - r ? 20 - r + Math.sqrt(Math.max(0, r * r - (rho - (10 - r)) ** 2)) : 20;
    v += 2 * Math.PI * rho * top * (10 / n);
  }
  return v;
}
for (const r of [3, 10, 15, 100]) {
  test(`the rim at the top of a post rounded by ${r} mm: the kernel's round while it can, then as large as the faces allow (a dome at 10)`, () => {
    const { s, rim } = post();
    const done = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "edgeMod", parts: rim(20), params: { mode: "fillet", value: r } } });
    assert.deepEqual(done.outcome.errors, {}, JSON.stringify(done.outcome.errors));
    const want = roundedPost(Math.min(r, 10));
    assert.ok(Math.abs(vol(done) - want) / want < 0.002, `volume ${vol(done).toFixed(1)}, the rounded post ${want.toFixed(1)}`);
  });
}

test("a chamfer of a rim that is bigger than the post saturates at the post's radius, and so does a fillet at the bottom edge", () => {
  const { s, rim } = post();
  const top = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "edgeMod", parts: rim(20), params: { mode: "chamfer", value: 50 } } });
  assert.deepEqual(top.outcome.errors, {});
  assert.ok(Math.abs(vol(top) - (Math.PI * 100 * 20 - (2 * Math.PI * 1000) / 3)) / vol(top) < 0.002, `a cone cut from the top: ${vol(top).toFixed(1)}`);
  const foot = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "edgeMod", parts: rim(0), params: { mode: "fillet", value: 40 } } });
  assert.deepEqual(foot.outcome.errors, {});
  assert.ok(Math.abs(vol(foot) - roundedPost(10)) / vol(foot) < 0.002, "the bottom edge, rounded as far as it goes: the same dome");
});


test("the foot of a small post on a larger one (a concave rim) is filled as far as the faces go", () => {
  let s = createSession(kernel);
  const big = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, big.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [big.circle], params: { depth: 10 } } });
  // a plane on the top of the post, and a smaller post on it
  const top = "d/p_top" as never;
  s = run(s, { type: "addPart", part: { ref: top, kind: "plane", origin: "drawn", plane: null, movable: false, at: [0, 0, 10], u: [1, 0, 0], v: [0, 1, 0], onBody: true } as never });
  const small = drawCircle(scene(s), top, [0, 0, 10], 4);
  s = run(s, small.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [small.circle], params: { depth: 10 } } });
  assert.deepEqual(s.outcome.errors, {});
  const before = vol(s);
  assert.ok(Math.abs(before - Math.PI * (100 * 10 + 16 * 10)) < 0.5, "two posts");
  const foot = (Object.values(scene(s).parts) as Part[]).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && !!p.circle && Math.abs(p.circle.center[2] - 10) < 1e-6 && Math.abs(p.circle.radius - 4) < 1e-6).map((p) => p.ref);
  assert.ok(foot.length >= 1);
  const filled = (r: number) => { const rc = 4 + r - (4 * r) / (3 * Math.PI); return Math.PI * ((4 + r) ** 2 - 16) * r - 2 * Math.PI * rc * ((Math.PI * r * r) / 4); };
  for (const [r, used] of [[3, 3], [20, 6]] as const) {
    const done = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "edgeMod", parts: foot, params: { mode: "fillet", value: r } } });
    assert.deepEqual(done.outcome.errors, {}, `r ${r}`);
    assert.ok(Math.abs(vol(done) - before - filled(used)) < 1.0, `r ${r}: added ${(vol(done) - before).toFixed(2)} of ${filled(used).toFixed(2)}`);
  }
});
