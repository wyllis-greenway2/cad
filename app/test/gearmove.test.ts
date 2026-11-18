// Moving and turning a gear's body (`in_817`): the body is moved by a step that says its sketches were carried along (`follow`), but a gear's sketch is derived from its record and is not carried: it is not read back through the move,
// or the bevel gear's loft stood where the move had taken it and its revolve (an axis in numbers) where it was, and the body came out as four pieces and a third of the material was gone.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, openSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { volume: number; bbox: { min: number[]; max: number[] } }[];
const step = (id: string, type: string, params: Record<string, number>) => ({ type: "addStep", step: { id, type, parts: ["b/body/o"], params } }) as never;
const specs: [string, GearSpec][] = [["bevel", { teeth: 20, module: 2, bevel: { mate: 20 }, bore: 5 }], ["helical", { teeth: 20, module: 2, bore: 5, helix: 15, width: 8 }], ["spur", { teeth: 20, module: 2, bore: 5, width: 8 }]];

test("a gear moved along Y by 11.2 and turned about X is still one body of the same volume, moved exactly; a move after the turn too", () => {
  for (const [name, spec] of specs) {
    const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [24.67, 26.32, 0], spec });
    const [b0] = bodies(s);
    assert.equal(bodies(s).length, 1, name);
    const moved = run(s, step("s_900", "move", { axis: 1, value: 11.2, follow: 1 }));
    assert.deepEqual(moved.outcome.errors, {}, name);
    assert.equal(bodies(moved).length, 1, `${name}: one body, not pieces`);
    assert.ok(Math.abs(bodies(moved)[0]!.volume - b0!.volume) < 1e-6, `${name}: the same material (${bodies(moved)[0]!.volume} against ${b0!.volume})`);
    assert.ok(Math.abs(bodies(moved)[0]!.bbox.min[1]! - b0!.bbox.min[1]! - 11.2) < 0.02, `${name}: moved by 11.2`);
    const turned = run(s, step("s_901", "rotate", { axis: 0, value: 30, px: 24.67, py: 26.32, pz: 0, follow: 1 }));
    assert.deepEqual(turned.outcome.errors, {}, name);
    assert.equal(bodies(turned).length, 1, name);
    assert.ok(Math.abs(bodies(turned)[0]!.volume - b0!.volume) < 1e-6, name);
    const again = run(turned, step("s_902", "move", { axis: 1, value: 11.2, follow: 1 }));
    assert.equal(bodies(again).length, 1, `${name}: a move after the turn`);
    assert.ok(Math.abs(bodies(again)[0]!.bbox.min[1]! - bodies(turned)[0]!.bbox.min[1]! - 11.2) < 0.02, `${name}: moved by 11.2 after the turn`);
  }
});

test("the saved project of the report (a bevel gear, hidden and shown, then moved by 11.2 along Y) opens as one body, the gear moved", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/bevel-move-in_817.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.equal(bodies(r.value).length, 1);
  assert.ok(Math.abs(bodies(r.value)[0]!.volume - 7940) < 2, `${bodies(r.value)[0]!.volume}`);
  assert.ok(Math.abs(bodies(r.value)[0]!.bbox.min[1]! - (4.9 + 11.2)) < 0.2);
});
