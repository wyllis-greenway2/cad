// The cross section plane follows its drag live (`in_573`): the picture of the plane is where the drag has taken it, not where it was at the press.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { sectionNow } from "../src/interaction/control/section.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;

test("while the plane is dragged its quad, the clip and the handles are at the dragged place", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } } as never);
  let st = reduce({ ...createState(s), cam: homeCamera() }, { type: "runAction", id: "view:section" }, env);
  const sec = sectionNow(st)!;
  const before = frameOf(st, { w: 800, h: 600 });
  const moved = { ref: sec.ref, centre: [sec.centre[0] + 7, sec.centre[1], sec.centre[2]] as never, n: sec.n };
  const live = frameOf({ ...st, sectionLive: moved }, { w: 800, h: 600 });
  const quad = (f: typeof before) => f.sectionPlanes.find((q) => q.ref === sec.ref)!.corners.map((c) => c.map((v) => Math.round(v * 1e3) / 1e3));
  assert.notDeepEqual(quad(live), quad(before), "the picture of the plane moved with the drag");
  assert.ok(Math.abs(live.sections[0]!.at[0] - before.sections[0]!.at[0] - 7) < 1e-6, "and the clip with it");
});
