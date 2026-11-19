// A gear edited while a mate holds it (`inv_constraint_uniformity`, `in_1170`): its numbers (teeth, bore) leave a coaxial mate true; moving it off the mate's axis is put back, and said.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { mateStatus } from "../src/operation/mates.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();
const spec: GearSpec = { teeth: 20, module: 2, bore: 5, width: 8 };

function matedGears(): Session {
  let s = createSession(kernel);
  s = run(s, { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: [60, 0, 0], spec: { ...spec, bore: 6 } });
  const bores = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.curved).map((p) => p.ref);
  assert.equal(bores.length, 2);
  const mate = actionsFor(scene(s), bores).find((a) => a.id === "mate:coaxial")!;
  const made = run(s, mate.run(0));
  assert.equal(made.message, null);
  return made;
}

test("a gear's bore and teeth edited while its bore is mated coaxial: the mate stays true, nothing is refused", () => {
  const s = matedGears();
  for (const edit of [{ ...spec, bore: 7 }, { ...spec, teeth: 30 }]) {
    const o = run(s, { type: "setGear", id: "g_001", spec: edit });
    assert.equal(o.message, null);
    assert.deepEqual(mateStatus(scene(o)).map((m) => m.state), ["ok"]);
  }
});

test("a gear moved off its mate's axis is put back with the change, and that is said", () => {
  const s = matedGears();
  const o = run(s, { type: "setGear", id: "g_001", spec, at: [10, 0, 0] });
  assert.equal(o.message, "the standing mates were put back with the change");
  assert.deepEqual(mateStatus(scene(o)).map((m) => m.state), ["ok"]);
});
