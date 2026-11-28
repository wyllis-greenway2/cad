import { test } from "node:test";
import assert from "node:assert/strict";
import { cam, demoScene, oneScene, emptyScene, near, W, H } from "./helpers.ts";
import { focusOf, paneAt, nothingInView, lastSeen, resetTarget, scaleAmong, gridLevel } from "../src/sense.ts";
import { bodyThings, centreOf, lookedAt } from "../src/scene.ts";
import { add, len, scale, sub, type V3 } from "../src/vec.ts";

const home = cam.home();

test("[C3] one thing is its own centre; an empty model looks at the point ahead", () => {
  const p = focusOf(oneScene(), home, W, H);
  near(p[0], 0, 1e-9);
  near(p[1], 0, 1e-9);
  near(p[2], 15, 1e-9);
  const q = focusOf(emptyScene(), home, W, H);
  assert.ok(len(q) < 1e-6, "ahead of the home view is the origin");
});

test("[C3] zoomed out, a group is looked at as a group: the point is the group's middle, not one thing's centre", () => {
  const sc = demoScene(),
    centres = sc.things.map(centreOf);
  const c: cam.Cam = { ...home, eye: scale(cam.forward(home), -3000) as V3 };
  const p = focusOf(sc, c, W, H);
  for (const a of centres) assert.ok(len(sub(p, a)) > 15, "not on any one thing's centre");
  const mid = scale(
    centres.reduce((s, q) => add(s, q), [0, 0, 0] as V3),
    1 / centres.length,
  ) as V3;
  assert.ok(len(sub(p, mid)) < 30, "near the middle of the three");
});

test("[C3] the point looked at moves smoothly as the view slides across a group (no jump)", () => {
  const sc = demoScene(),
    f = cam.forward(home),
    right = cam.rightOf(home);
  let last: V3 | null = null,
    worst = 0;
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
  for (const d of [200, 600, 2500])
    for (const yaw of [0, 1.2, 2.4, 3.6, 5]) {
      const c: cam.Cam = {
        ...home,
        yaw: home.yaw + yaw,
        eye: scale(cam.forward({ ...home, yaw: home.yaw + yaw }), -d) as V3,
      };
      const p = focusOf(sc, c, W, H),
        q = cam.project(c, p, W, H);
      const inView = sc.things.some((t) => {
        const r = cam.project(c, centreOf(t), W, H);
        return r.depth > 0 && r.x >= 0 && r.x <= W && r.y >= 0 && r.y <= H;
      });
      if (inView) assert.ok(q.x >= -1 && q.x <= W + 1 && q.y >= -1 && q.y <= H + 1, `off the screen at ${q.x},${q.y}`);
    }
});

test("[W12] a pane takes a ray only over a face in its own plane", () => {
  const sc = { things: [{ id: "x", lo: [3, 3, 0] as V3, hi: [11, 11, 5] as V3 }] };
  const down: V3 = [0, 0, -1],
    up: V3 = [0, 0, 1];
  assert.equal(
    paneAt(sc, [7, 7, 40], down),
    null,
    "the top face is in front of the pane and is not in its plane: a face",
  );
  assert.ok(paneAt(sc, [7, 7, -40], up), "the bottom face is in the pane's plane: the pane");
  assert.ok(paneAt({ things: [] }, [7, 7, 40], down), "no thing: the pane");
  assert.ok(
    paneAt({ things: [{ id: "y", lo: [20, 20, 0] as V3, hi: [30, 30, 5] as V3 }] }, [7, 7, 40], down),
    "a thing elsewhere: the pane",
  );
});

test("[C17] far away, or with the thing behind, the view is lost; framed on the thing, it is not", () => {
  const sc = oneScene();
  assert.equal(nothingInView(sc, home, W, H), false);
  assert.equal(
    nothingInView(sc, { ...home, eye: [5000, 5000, 5000], yaw: 0.3, pitch: 0.2 }, W, H),
    true,
    "far away and looking elsewhere",
  );
  assert.equal(nothingInView(sc, { ...home, yaw: home.yaw + Math.PI }, W, H), true, "looking the wrong way");
  const t = sc.things[0]!;
  assert.equal(nothingInView(sc, cam.frameBox(t.lo, t.hi, W / H), W, H), false, "the framing shows it");
});

test("[C17] in a straight (orthographic) view there is no behind: a thing on the far side of the plane the eye is held at is still in view", () => {
  const sc = oneScene(),
    top = { ...home, eye: [0, 0, 0] as V3, yaw: 0, pitch: -Math.PI / 2, ortho: 120 }; // (looking down from the floor: the box stands above the eye plane's depth)
  assert.equal(nothingInView(sc, top, W, H), false);
  assert.equal(nothingInView(emptyScene(), top, W, H), false, "and so is the world's own box when the model is empty");
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
  const far = scaleAmong(sc, { ...home, eye: scale(cam.forward(home), -4000) as V3 }),
    nearer = scaleAmong(sc, { ...home, eye: scale(cam.forward(home), -400) as V3 });
  assert.ok(far > nearer * 5);
});

test("[W6] the grid's spacing depends on the distance to the plane and on nothing else", () => {
  const eye: V3 = [74, 74, 57];
  const a = gridLevel({ ...home, eye, yaw: 0.3, pitch: -0.2 }, 2),
    b = gridLevel({ ...home, eye, yaw: 2.9, pitch: -1.2 }, 2);
  assert.equal(a.step, b.step);
  near(a.blend, b.blend, 1e-12);
  const levels = [200, 120, 60, 30, 10, 3].map((z) => gridLevel({ ...home, eye: [0, 0, z] }, 2).step);
  assert.deepEqual(levels, [10, 10, 10, 1, 1, 0.1]);
});

test("[W7] the fog reaches out with the distance to the origin and the plane; an orthographic view has none", () => {
  const c = { ...home, lens: 1 };
  const near1 = gridLevel({ ...c, eye: [0, 0, 20] }, 2),
    far1 = gridLevel({ ...c, eye: [0, 0, 400] }, 2);
  assert.ok(far1.fog > near1.fog * 10, "a view ten times farther sees a fog ten times farther");
  assert.ok(near1.fog >= len([0, 0, 20]), "the fog never closes in nearer than the origin");
  const flat = gridLevel({ ...c, eye: [0, 0, 20], ortho: 40 }, 2);
  assert.ok(flat.fog >= 1e9, "no fog in a straight view");
});

// ---- the bodies the engine made are what the camera looks at ----
/** a box as an engine body's points: its eight corners */
const body = (id: string, lo: V3, hi: V3) => ({
  id,
  positions: new Float32Array(
    [0, 1].flatMap((i) =>
      [0, 1].flatMap((j) => [0, 1].flatMap((k) => [i ? hi[0] : lo[0], j ? hi[1] : lo[1], k ? hi[2] : lo[2]])),
    ),
  ),
});
test("[C3] a body the engine made is a thing: its box, once, however often it is asked", () => {
  const b = body("e1", [200, 300, 10], [220, 310, 30]);
  const [t] = bodyThings([b]);
  assert.deepEqual([t!.id, t!.lo, t!.hi], ["e1", [200, 300, 10], [220, 310, 30]]);
  assert.equal(bodyThings([b])[0], t, "the same box for the same body");
  assert.deepEqual(
    bodyThings([{ id: "none", positions: new Float32Array(0) }]),
    [],
    "a body with no points is not a thing",
  );
});
test("[C3 C8] with a body far from the origin the camera looks at the body and steps by its scale, not by the eye's distance from the origin", () => {
  const far = lookedAt(emptyScene(), bodyThings([body("e1", [1000, 1000, 0], [1040, 1020, 20])])),
    c: cam.Cam = { ...home, eye: [1100, 1100, 90] as V3, yaw: Math.atan2(-100, -100), pitch: -0.4 };
  const p = focusOf(far, c, W, H),
    centre = centreOf(far.things[0]!);
  assert.ok(len(sub(p, centre)) < 1, `the point looked at is the body's middle: ${p}`);
  assert.ok(
    scaleAmong(far, c) < scaleAmong(emptyScene(), c) / 4,
    "and the step follows the body, not the eye's 1500 mm from the origin",
  );
});
test("[C17] a body out of view is lost, and Reset goes to it", () => {
  const sc = lookedAt(emptyScene(), bodyThings([body("e1", [1000, 1000, 0], [1040, 1020, 20])]));
  assert.equal(nothingInView(sc, home, W, H), true, "the home view does not see it");
  assert.equal(resetTarget(sc, null).id, "e1");
});
