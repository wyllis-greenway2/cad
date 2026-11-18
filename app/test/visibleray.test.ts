// Whether a point can be seen from the eye (`visibleFrom`, `in_965`): found with one tree of boxes over the faces of the model, the same answers as asking every face; and quick enough to ask for every corner of two meshed gears.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { visibleFrom } from "../src/interaction/picking.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { depthOf, normalOfPlane } from "../src/operation/part.ts";
import type { Part } from "../src/operation/part.ts";
import { lookup } from "../src/operation/scene.ts";
import { dot, sub } from "../src/math/vec.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const r = openSession(kernel, readFileSync(new URL("./fixtures/meshed-gears-sketching-in_965.cad.json", import.meta.url), "utf8"));
assert.ok(r.ok);
const sc = scene((r as { ok: true; value: Parameters<typeof scene>[0] }).value);

/** the answer found by asking every face one by one (what it was before) */
function slow(pv: ReturnType<ReturnType<typeof projector>["view"]>, point: Vec3, plane?: { at: Vec3; n: Vec3 }): boolean {
  const occluders = Object.values(sc.parts).filter((p: Part) => p.kind === "plane" && p.origin === "body");
  if (!pv.rayAt || !occluders.length) return true;
  const [x, y] = pv.project(point);
  const ray = pv.rayAt(x, y);
  const get = lookup(sc);
  const tPlane = plane ? (() => { const den = dot(plane.n, ray.d); return Math.abs(den) < 1e-9 ? null : dot(plane.n, sub(plane.at, ray.o)) / den; })() : null;
  const tp = dot(sub(point, ray.o), ray.d);
  for (const o of occluders) {
    const t = depthOf(get, o, { ...pv, ray });
    if (t !== null && t < tp - 1e-3 - 1.5e-3 * tp && !(tPlane !== null && t < tPlane - 1e-3)) return false;
  }
  return true;
}

test("the same answer as asking every face, from several places, with and without a plane being sketched on", () => {
  const corners = Object.values(sc.parts).filter((p: Part) => p.kind === "corner" && p.origin === "body").map((p) => (p as Extract<Part, { kind: "corner" }>).at);
  assert.ok(corners.length > 400, `${corners.length} corners of the bodies`);
  let seen = 0, hidden = 0;
  for (const cam of [{ ...homeCamera(), target: [35, 25, 3] as Vec3 }, { ...homeCamera(), azimuth: 2.2, elevation: 0.3, target: [35, 25, 3] as Vec3 }, { ...homeCamera(), elevation: 1.4, target: [35, 25, 3] as Vec3 }]) {
    const pv = projector(cam, 1280, 720).view(0, 0);
    for (const plane of [undefined, { at: [0, 0, 0] as Vec3, n: [0, 0, 1] as Vec3 }]) {
      for (let i = 0; i < corners.length; i += 3) {
        const [a, b] = [visibleFrom(sc, pv, corners[i]!, plane), slow(pv, corners[i]!, plane)];
        assert.equal(a, b, `corner ${i} from ${JSON.stringify([cam.azimuth, cam.elevation])}${plane ? " with a plane" : ""}`);
        if (a) seen++; else hidden++;
      }
    }
  }
  assert.ok(seen > 50 && hidden > 50, `a mix of seen and hidden (${seen} seen, ${hidden} hidden)`);
});

test("every corner of two meshed gears is asked in well under a second", () => {
  const corners = Object.values(sc.parts).filter((p: Part) => p.kind === "corner" && p.origin === "body").map((p) => (p as Extract<Part, { kind: "corner" }>).at);
  const pv = projector({ ...homeCamera(), azimuth: 1.1, target: [35, 25, 3] as Vec3 }, 1280, 720).view(0, 0);
  const t = performance.now();
  for (const c of corners) visibleFrom(sc, pv, c, { at: [0, 0, 0], n: normalOfPlane({ kind: "plane", at: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] } as never) });
  const ms = performance.now() - t;
  assert.ok(ms < 800, `${corners.length} corners in ${ms.toFixed(0)} ms`);
});
