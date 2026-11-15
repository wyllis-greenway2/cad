// A fillet or chamfer of a straight edge between two flat faces has no size that fails (`in_386`, `dec_edits_saturate` B): where the kernel's rolling fillet cannot be made the corner is made as a region that is cut
// (a convex edge) or added (a concave one), and past the size where the rounding stops touching the faces next to it, it crosses them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run, createSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawChain } from "../src/operation/build.ts";
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

test("an edge between a flat face and a curved one is still the kernel's own fillet, with its refusal", () => {
  // the cylinder's rim: not straight, so no region; a size too big for it is refused as before
  let s = createSession(kernel);
  s = run(s, { type: "batch", commands: [{ type: "addPart", part: { origin: "drawn", plane: XY, movable: true, ref: "d/e_001.c", kind: "corner", at: [0, 0, 0] } as never }, { type: "addPart", part: { origin: "drawn", plane: XY, movable: true, ref: "d/e_001.k", kind: "circle", center: "d/e_001.c", radius: 10 } as never }] });
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: ["d/e_001.k"] as never, params: { depth: 20 } } });
  const rim = (Object.values(scene(s).parts) as Part[]).find((p) => p.kind === "line" && p.origin === "body" && !!p.circle)!;
  const done = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "edgeMod", parts: [rim.ref], params: { mode: "fillet", value: 15 } } });
  assert.equal(scene(done).steps.length, scene(s).steps.length, "refused");
});
