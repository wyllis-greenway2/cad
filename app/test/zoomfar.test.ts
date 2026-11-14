// The view's target left in empty space, far past the model: the wheel still zooms up to what is under the pointer (`in_337`). Before, a surface farther from the target than 1.5 view-distances was not zoomed toward,
// so with a short distance to an empty target the model could not be reached: the zoom stalled.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { Env } from "../src/interaction/control/state.ts";
import { projector } from "../src/interaction/camera.ts";
import { sub } from "../src/math/vec.ts";

await kernel.init();
const env = { w: 1280, h: 687, now: 0 } as Env;
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/zoom-target-in-empty-space-in_337.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;

test("with the target in empty space, zooming in on the model brings the model closer, not just the empty target", () => {
  let s = createState(open());
  // the view as the snapshot of `in_337` had it: 4.6 mm from a target about 70 mm past the model
  s = { ...s, cam: { target: [65.6428, -23.2438, 38.8862], distance: 4.6173, azimuth: -0.7716, elevation: 0.5051, straight: false, mix: 1, eyeDistance: 4.6173, perspective: 1 } as typeof s.cam };
  const centre = [24, 20, 5] as const;
  const eyeTo = (c: typeof s.cam) => { const p = projector(c, env.w, env.h); const [x, y] = p.project(centre as never); return { x, y, p }; };
  const before = eyeTo(s.cam);
  const dist = (c: typeof s.cam) => { const e = projector(c, env.w, env.h).eye ?? null; return e ? Math.hypot(...sub(e as never, centre as never)) : NaN; };
  const d0 = dist(s.cam);
  for (let k = 0; k < 6; k++) s = reduce(s, { type: "zoom", factor: 0.8, x: before.x, y: before.y }, env);
  const d1 = dist(s.cam);
  assert.ok(d1 < d0 * 0.5, `the eye is much closer to the model (${d0.toFixed(1)} -> ${d1.toFixed(1)})`);
});
