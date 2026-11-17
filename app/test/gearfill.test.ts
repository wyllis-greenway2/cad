// The fill of a gear and of a ring with a gear in it (`in_686`): the side of a tooth is a chain of short arcs, and each was drawn as 64 pieces, so a ring of 40 teeth with a gear of 20 in it was a polygon of tens of thousands of points and its fill did not come back
// (the page stood still when a gear was meshed into a ring).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { surfaceTriangles } from "../src/interaction/surfaces.ts";
import { lookup } from "../src/operation/scene.ts";
import { meshWith } from "../src/operation/mesh.ts";
import { arcPoints } from "../src/operation/part.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();

test("a small arc is drawn in a few pieces, a whole circle in as many as before", () => {
  const small = arcPoints([1, 0, 0], [Math.cos(0.025), Math.sin(0.025), 0], [Math.cos(0.05), Math.sin(0.05), 0], 64);
  assert.ok(small.length <= 4, `a 3 degree arc: ${small.length} points`);
  const half = arcPoints([1, 0, 0], [0, 1, 0], [-1, 0, 0], 64);
  assert.equal(half.length, 33, "a half circle keeps its 32 pieces");
});

test("a ring with a gear in it fills in a fraction of a second, with a few thousand triangles at most", () => {
  let s = createSession(kernel);
  s = run(s, { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { teeth: 40, module: 1, internal: true } } as never);
  const ring = Object.values(scene(s).gears ?? {})[0]!;
  const r = meshWith(ring, [1, 0, 0], [0, 1, 0], { teeth: 20 }, 0.7);
  assert.ok(r.ok);
  if (!r.ok) return;
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: r.value.at, spec: r.value.spec, turn: r.value.turn } as never);
  const sc = scene(s);
  const get = lookup(sc);
  const t0 = Date.now();
  let triangles = 0;
  for (const p of Object.values(sc.parts) as Part[]) if (p.kind === "face") triangles += (surfaceTriangles(get, p)?.length ?? 0) / 9;
  assert.ok(triangles > 100 && triangles < 6000, `${triangles} triangles`);
  assert.ok(Date.now() - t0 < 3000, `the fills took ${Date.now() - t0} ms`);
});
