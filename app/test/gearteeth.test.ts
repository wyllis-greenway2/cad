// The surface of a gear's teeth, a worm's thread, can be picked (`in_1129`): a gear's faces are not parts of their own (there are thousands), but the triangles of all of them are one part, so a click on the teeth lands on the body.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { candidatesAt } from "../src/interaction/picking.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();
const made = (spec: GearSpec) => run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec } as never);
const teethOf = (s: ReturnType<typeof made>) => Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "teeth");

test("a worm, a spur gear and a bevel gear each have one face for their teeth, beside their flat ends", () => {
  for (const spec of [{ teeth: 1, module: 2, worm: { diameter: 19, length: 30 } }, { teeth: 20, module: 2, width: 6 }, { teeth: 20, module: 2, bevel: { mate: 30 } }] as GearSpec[]) {
    const s = made(spec);
    assert.ok(!s.message, s.message ?? "");
    const t = teethOf(s);
    assert.equal(t.length, 1, JSON.stringify(spec));
    assert.ok(t[0]!.kind === "plane" && (t[0]!.mesh?.length ?? 0) > 300, "the triangles of the thread or the teeth are there to be hit");
  }
});
test("a click on the side of a worm, off its ends, lands on its teeth face", () => {
  const sc = scene(made({ teeth: 1, module: 2, worm: { diameter: 19, length: 30 } }));
  const pr = projector(homeCamera(), 800, 600);
  let teeth = 0;
  for (let x = 300; x < 520; x += 10) for (let y = 220; y < 380; y += 10) {
    const top = candidatesAt(sc, pr.view(x, y), { pointTol: 0, lineTol: 0 })[0];
    if (top && sc.parts[top.ref]?.kind === "plane" && (sc.parts[top.ref] as { rounded?: string }).rounded === "teeth") teeth++;
  }
  assert.ok(teeth > 20, `${teeth} places over the worm picked its teeth`);
});
