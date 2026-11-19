// A hard gear is tested on all of its body, the walls of its teeth too (`in_992`): the kernel's mesh, not the face planes of the scene (a gear body has two of those, its top and bottom).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef, diskFaceRef } from "../src/operation/loops.ts";
import { meshWith } from "../src/operation/mesh.ts";
import { bodyOfGear } from "../src/operation/gearcouple.ts";
import { hardCollision, meshOf } from "../src/interaction/hard.ts";
import { jointOf } from "../src/operation/frames.ts";

await kernel.init();
const XY = worldRef("XY");

test("two hard gears meet by their teeth: turned into each other, the test finds the other gear (the face planes of a gear body leave the walls of its teeth out)", () => {
  const g1 = { id: "g_001", plane: XY, at: [0, 0, 0] as [number, number, number], spec: { teeth: 20, module: 2, backlash: 0.15 } };
  const p = meshWith(g1 as never, [1, 0, 0], [0, 1, 0], { teeth: 30 }, 0);
  assert.ok(p.ok);
  if (!p.ok) return;
  let s = createSession(kernel);
  for (const r of [g1, { id: "g_002", plane: XY, at: [...p.value.at] as [number, number, number], spec: p.value.spec, turn: p.value.turn }]) {
    s = run(s, { type: "gear", id: r.id, plane: XY, at: r.at, spec: r.spec, ...("turn" in r && r.turn ? { turn: r.turn } : {}) });
    const refs = gearRefs(r as never);
    const op = startOp(scene(s), [(refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)) as never], "extrude");
    assert.ok(op.ok);
    s = runOp(s, { ...(op as { op: Op }).op, value: 5 })!.session;
  }
  const [a, b] = scene(s).gears!.map((g) => bodyOfGear(scene(s), g)!);
  s = run(s, { type: "setHard", body: (scene(s).parts[a!] as { id: string }).id, on: true });
  const sc = scene(s);
  const mesh = meshOf(sc, a!)!;
  assert.ok(mesh.tris.length / 9 > 1800, `the whole body (${mesh.tris.length / 9} triangles): the caps are 1,276 of them, the walls the rest`);
  assert.deepEqual(hardCollision(sc, [a!], () => jointOf("turn", [0, 0, 0], [0, 0, 1], 0)), [], "at rest, with the play between the teeth, they do not meet");
  assert.deepEqual(hardCollision(sc, [a!], () => jointOf("turn", [0, 0, 0], [0, 0, 1], 12)), [b], "turned 12 degrees, a tooth is in the other gear");
});
