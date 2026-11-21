import { test } from "node:test";
import assert from "node:assert/strict";
import { cam, demoScene, oneScene, emptyScene, near, W, H } from "./helpers.ts";
import { focusOf, paneAt, nothingInView, lastSeen, resetTarget, scaleAmong, gridLevel } from "../src/sense.ts";
import { centreOf } from "../src/scene.ts";
import { add, len, scale, sub, type V3 } from "../src/vec.ts";

const home = cam.home();

test("[C3] one thing is its own centre; an empty model looks at the point ahead", () => {
  const p = focusOf(oneScene(), home, W, H);
  near(p[0], 0, 1e-9); near(p[1], 0, 1e-9); near(p[2], 15, 1e-9);
  const q = focusOf(emptyScene(), home, W, H);
  assert.ok(len(q) < 1e-6, "ahead of the home view is the origin");
});

test("[C3] zoomed out, a group is looked at as a group: the point is the group's middle, not one thing's centre", () => {
  const sc = demoScene(), centres = sc.things.map(centreOf);
  const c: cam.Cam = { ...home, eye: scale(cam.forward(home), -3000) as V3 };
  const p = focusOf(sc, c, W, H);
  for (const a of centres) assert.ok(len(sub(p, a)) > 15, "not on any one thing's centre");
  const mid = scale(centres.reduce((s, q) => add(s, q), [0, 0, 0] as V3), 1 / centres.length) as V3;
  assert.ok(len(sub(p, mid)) < 30, "near the middle of the three");
});

test("[C3] the point looked at moves smoothly as the view slides across a group (no jump)", () => {
  const sc = demoScene(), f = cam.forward(home), right = cam.rightOf(home);
  let last: V3 | null = null, worst = 0;
  for (let i = 0; i <= 400; i++) {
    const c: cam.Cam = { ...home, eye: add(scale(f, -400), scale(right, -150 + i * 0.75)) as V3 };
    const p = focusOf(sc, c, W, H);
    if (last) worst = Math.max(worst, len(sub(p, last)));
    last = p;
  }
  assert.ok(worst < 5, `the biggest jump was ${worst.toFixed(1)} mm`);
});

test("[C3] the point looked at is always on the screen when anything is in view", () => {
  const sc = demoScene();
  for (const d of [200, 600, 2500]) for (const yaw of [0, 1.2, 2.4, 3.6, 5]) {
    const c: cam.Cam = { ...home, yaw: home.yaw + yaw, eye: scale(cam.forward({ ...home, yaw: home.yaw + yaw }), -d) as V3 };
    const p = focusOf(sc, c, W, H), q = cam.project(c, p, W, H);
    const inView = sc.things.some((t) => { const r = cam.project(c, centreOf(t), W, H); return r.depth > 0 && r.x >= 0 && r.x <= W && r.y >= 0 && r.y <= H; });
    if (inView) assert.ok(q.x >= -1 && q.x <= W + 1 && q.y >= -1 && q.y <= H + 1, `off the screen at ${q.x},${q.y}`);
  }
});

test("[W12] a pane takes a ray only over a face in its own plane", () => {
  const sc = { things: [{ id: "x", lo: [3, 3, 0] as V3, hi: [11, 11, 5] as V3 }] };
  const down: V3 = [0, 0, -1], up: V3 = [0, 0, 1];
  assert.equal(paneAt(sc, [7, 7, 40], down), null, "the top face is in front of the pane and is not in its plane: a face");
  assert.ok(paneAt(sc, [7, 7, -40], up), "the bottom face is in the pane's plane: the pane");
  assert.ok(paneAt({ things: [] }, [7, 7, 40], down), "no thing: the pane");
  assert.ok(paneAt({ things: [{ id: "y", lo: [20, 20, 0] as V3, hi: [30, 30, 5] as V3 }] }, [7, 7, 40], down), "a thing elsewhere: the pane");
});

test("[C17] far away, or with the thing behind, the view is lost; framed on the thing, it is not", () => {
  const sc = oneScene();
  assert.equal(nothingInView(sc, home, W, H), false);
  assert.equal(nothingInView(sc, { ...home, eye: [5000, 5000, 5000], yaw: 0.3, pitch: 0.2 }, W, H), true, "far away and looking elsewhere");
  assert.equal(nothingInView(sc, { ...home, yaw: home.yaw + Math.PI }, W, H), true, "looking the wrong way");
  const t = sc.things[0]!;
  assert.equal(nothingInView(sc, cam.frameBox(t.lo, t.hi, W / H), W, H), false, "the framing shows it");
});

test("[C17] a thing smaller than 6 px counts as lost; the last thing seen is the reset target, then the last there is", () => {
  const sc = oneScene();
  assert.equal(nothingInView(sc, { ...home, eye: scale(cam.forward(home), -200000) as V3 }, W, H), true, "tiny");
  assert.equal(lastSeen(sc, home, W, H), "a");
  assert.equal(resetTarget(demoScene(), "b").id, "b");
  assert.equal(resetTarget(demoScene(), "gone").id, "c", "the last there is");
  assert.equal(resetTarget(emptyScene(), null).id, "world");
});

test("[C8] the scale of what the eye is among is never under the floor and follows the nearest thing", () => {
  const sc = oneScene();
  assert.ok(scaleAmong(sc, home) >= 20);
  const far = scaleAmong(sc, { ...home, eye: scale(cam.forward(home), -4000) as V3 }), nearer = scaleAmong(sc, { ...home, eye: scale(cam.forward(home), -400) as V3 });
  assert.ok(far > nearer * 5);
});

test("[W6] the grid's spacing depends on the distance to the plane and on nothing else", () => {
  const eye: V3 = [74, 74, 57];
  const a = gridLevel({ ...home, eye, yaw: 0.3, pitch: -0.2 }, 2), b = gridLevel({ ...home, eye, yaw: 2.9, pitch: -1.2 }, 2);
  assert.equal(a.step, b.step); near(a.blend, b.blend, 1e-12);
  const levels = [200, 120, 60, 30, 10, 3].map((z) => gridLevel({ ...home, eye: [0, 0, z] }, 2).step);
  assert.deepEqual(levels, [10, 10, 10, 1, 1, 0.1]);
});
