// A gear moved, turned or scaled by steps is still one feature (`in_826`, `dec_gear_feature`): the shape the scene gives its body follows the moves, so the body keeps the few parts a person picks and not a face and edges for every tooth.
// And a worm wheel with a land is one (its radius at the faces of the land was not a number).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();
const parts = (s: Session) => Object.values(scene(s).parts).filter((p) => p.origin === "body").length;
const make = (spec: GearSpec) => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
const step = (id: string, type: string, params: Record<string, number>) => ({ type: "addStep", step: { id, type, parts: ["b/body/o"], params } }) as never;

test("a spur gear moved, turned about a point (also off its own axis) and moved again keeps the parts of one feature", () => {
  const s0 = make({ teeth: 40, module: 2, width: 8, bore: 5 });
  const base = parts(s0);
  assert.ok(base < 20, `made: ${base}`);
  const moved = run(s0, step("s_900", "move", { axis: 0, value: 30, follow: 1 }));
  assert.ok(parts(moved) < 20, `moved: ${parts(moved)}`);
  const turned = run(moved, step("s_901", "rotate", { axis: 0, value: 30, px: 30, py: 0, pz: 0, follow: 1 }));
  assert.ok(parts(turned) < 20, `moved then turned about X (a tilted gear): ${parts(turned)}`);
  const again = run(turned, step("s_902", "move", { axis: 1, value: 11.2, follow: 1 }));
  assert.ok(parts(again) < 20, `and moved again: ${parts(again)}`);
});

test("a worm wheel with a land is one feature too (1169 planes before)", () => {
  const s = make({ teeth: 30, module: 2, wheel: { starts: 1, diameter: 20, width: 9.6, land: 4 }, bore: 5 });
  assert.deepEqual(s.outcome.errors, {});
  assert.ok(parts(s) < 30, `${parts(s)}`);
});

test("a rack, a helical rack, a turned rack and a moved rack are one feature too (46 planes and 132 lines for 10 teeth before)", () => {
  for (const [name, spec, turn] of [["straight", { teeth: 40, module: 2, width: 8, rack: true }, 0], ["helical", { teeth: 40, module: 2, width: 8, rack: true, helix: 15 }, 0], ["turned", { teeth: 40, module: 2, width: 8, rack: true }, 0.7]] as [string, GearSpec, number][]) {
    const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [3, 4, 0], spec, ...(turn ? { turn } : {}) });
    assert.deepEqual(s.outcome.errors, {}, name);
    assert.ok(parts(s) < 12, `${name}: ${parts(s)}`);
    const moved = run(s, step("s_900", "move", { axis: 1, value: 7, follow: 1 }));
    assert.ok(parts(moved) < 12, `${name}, moved: ${parts(moved)}`);
  }
});
