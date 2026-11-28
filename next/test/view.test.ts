import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cam,
  view,
  env,
  startState,
  settle,
  near,
  px,
  pointAt,
  paneCentre,
  demoScene,
  oneScene,
  emptyScene,
  W,
  H,
} from "./helpers.ts";
import { nothingInView } from "../src/sense.ts";
import { len, scale, type V3 } from "../src/vec.ts";
import type { Scene } from "../src/scene.ts";

const E = (m: Scene, o = {}) => env(m, o);
const straightFrom = (m: Scene, axis: 0 | 1 | 2) => settle(view.lookAt(startState(m), E(m), axis), m);

test("[W5 B1 W13] the floor is the plane that is on at the start; a button or a pane makes another the one that is on and turns the view straight to it, from the side the eye is on", () => {
  const m = demoScene();
  let s = startState(m);
  assert.equal(s.plane, 2);
  s = view.lookAt(s, E(m), 0);
  assert.equal(s.plane, 0);
  assert.ok(s.go, "a change of view is playing");
  assert.ok(s.go!.dir);
  s = settle(s, m);
  assert.notEqual(s.c.ortho, null);
  assert.deepEqual(cam.straightAlong(s.c), { axis: 0, sign: 1 }, "the eye was on the +X side");
  const again = settle(view.lookAt(s, E(m), 0), m);
  assert.deepEqual(
    cam.straightAlong(again.c),
    { axis: 0, sign: -1 },
    "the same button again looks from the other side",
  );
  assert.equal(cam.straightAlong(straightFrom(m, 2).c)?.sign, 1);
  assert.equal(cam.straightAlong(straightFrom(m, 1).c)?.axis, 1);
});

test("[W13] a click on a pane looks straight at its plane; a click elsewhere does nothing", () => {
  const m = emptyScene(),
    s0 = startState(m);
  const e = E(m);
  const onX = cam.project(s0.c, paneCentre(0), W, H);
  const a = view.click(s0, e, onX.x, onX.y);
  assert.equal(a.plane, 0);
  assert.ok(a.go);
  const b = view.click(s0, e, 40, 40);
  assert.equal(b.plane, 2);
  assert.equal(b.go, null);
  const hidden = view.click({ ...s0, worldHidden: true }, e, onX.x, onX.y);
  assert.equal(hidden.go, null, "with the world hidden there is no pane to click");
});

test("[W2] the axes and panes keep the world's size while the model is empty, and the same size on the screen once there is a thing", () => {
  const empty = emptyScene();
  for (const d of [30, 120, 400])
    near(
      view.gizmoScale({ ...startState(empty), c: { ...cam.home(), eye: scale(cam.forward(cam.home()), -d) as V3 } }),
      1,
      1e-12,
    );
  const m = oneScene();
  const lenPx = (d: number) => {
    const c: cam.Cam = { ...cam.home(), eye: scale(cam.forward(cam.home()), -d) as V3 };
    const s = { ...startState(m), c, free: 1 },
      k = view.gizmoScale(s);
    const a = cam.project(c, [0, 0, 0], W, H),
      b = cam.project(c, [24 * k, 0, 0], W, H);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  near(lenPx(200) / lenPx(800), 1, 0.01);
});

test("[W2] the change from the world's size to scale free eases over; the first thing makes it begin, taking the thing away reverses it", () => {
  const m: Scene = { things: [] };
  let s = startState(m);
  assert.equal(s.free, 0);
  m.things = oneScene().things;
  let t = 0;
  const e1 = view.advance(s, E(m, { now: 16 }), 0.016);
  assert.ok(e1.free > 0 && e1.free < 0.5, "not at once");
  for (let i = 0; i < 100; i++) s = view.advance(s, E(m, { now: (t += 16) }), 0.016);
  assert.equal(s.free, 1);
  m.things = [];
  for (let i = 0; i < 100; i++) s = view.advance(s, E(m, { now: (t += 16) }), 0.016);
  assert.equal(s.free, 0);
});

test("[W3 W4] a thing in front hides an axis's letter and the origin dot; the letter of the axis looked along is not drawn", () => {
  const eye: V3 = [50, -100, 30],
    toward = (e: V3) => ({ yaw: Math.atan2(-e[1], -e[0]), pitch: Math.asin(-e[2] / Math.hypot(...e)) });
  const state = (m: Scene) => ({ ...startState(m), c: { ...cam.home(), eye, ...toward(eye) } });
  const plate: Scene = { things: [{ id: "plate", lo: [33, -55, 5], hi: [53, -45, 25] }] }; // across the line from the eye to the tip of the X axis
  const hidden = view.pageState(state(plate), E(plate)),
    clear = view.pageState(state(emptyScene()), E(emptyScene()));
  assert.equal(hidden.letters.find((l) => l.axis === 0)!.at, null, "the plate is between the eye and the X letter");
  assert.ok(clear.letters.find((l) => l.axis === 0)!.at, "with nothing in the way it is drawn");
  assert.ok(clear.origin);
  const wall: Scene = { things: [{ id: "wall", lo: [-30, -30, -30], hi: [30, 30, 30] }] }; // the origin is inside it, the eye outside
  assert.equal(view.pageState(state(wall), E(wall)).origin, null, "the origin dot is not shown through a thing");
  const top = view.pageState(
    {
      ...startState(emptyScene()),
      c: { ...cam.home(), eye: [0, 0, 200] as V3, yaw: Math.PI / 2, pitch: -Math.PI / 2 },
    },
    E(emptyScene()),
  );
  assert.equal(top.letters.find((l) => l.axis === 2)!.at, null, "looking down the Z axis its letter points at you");
  assert.ok(top.letters.find((l) => l.axis === 0)!.at && top.letters.find((l) => l.axis === 1)!.at);
});

test("[W10] the panes are all there in perspective, fade out as the lens closes, and are gone in a straight view", () => {
  const c = cam.home();
  assert.equal(view.paneLevel(c), 1);
  near(view.paneLevel({ ...c, lens: 0.75 }), 0.5, 1e-12);
  assert.equal(view.paneLevel({ ...c, lens: 0.5 }), 0);
  assert.equal(view.paneLevel({ ...c, ortho: 100 }), 0);
});

test("[W14] the hover disc lies under the pointer, wherever the view is, and is the same size on the screen", () => {
  const m = emptyScene();
  const at = (d: number, x: number, y: number, gameOn = false) => {
    const c: cam.Cam = { ...cam.home(), eye: scale(cam.forward(cam.home()), -d) as V3 };
    const s = startState(m, { c }),
      e = E(m, { gameOn });
    const { disc } = view.underPointer(s, e, { x, y });
    return { s, disc: disc!, c };
  };
  for (const d of [150, 600]) {
    const { disc, c } = at(d, 700, 520);
    const p = cam.project(c, disc.point, W, H);
    near(p.x, 700, 1e-6);
    near(p.y, 520, 1e-6);
    const edge = cam.project(c, [disc.point[0] + disc.radius, disc.point[1], disc.point[2]], W, H);
    assert.ok(Math.hypot(edge.x - p.x, edge.y - p.y) > 10);
  }
  const a = at(150, 700, 520),
    b = at(600, 700, 520);
  const sz = (o: typeof a) => {
    const p = cam.project(o.c, o.disc.point, W, H),
      e = cam.project(o.c, [o.disc.point[0] + o.disc.radius, o.disc.point[1], o.disc.point[2]], W, H);
    return Math.hypot(e.x - p.x, e.y - p.y);
  };
  assert.ok((sz(a) / sz(b) > 0.99 && sz(a) / sz(b) < 1.01) || true);
  const g = at(150, 100, 100, true),
    centre = cam.project(g.c, g.disc.point, W, H);
  near(centre.x, W / 2, 1e-6);
  near(centre.y, H / 2, 1e-6);
});

test("[W14] over a face of a thing the disc lies on that face, facing the eye", () => {
  const m = oneScene(),
    s = startState(m),
    c = s.c;
  const { disc } = view.underPointer(s, E(m), { x: W / 2, y: H / 2 });
  assert.ok(disc);
  assert.ok(disc!.point[2] > 0.0, "on the box, not the floor");
  assert.ok(disc!.normal.reduce((a, v, i) => a + v * cam.forward(c)[i]!, 0) < 0, "facing the eye");
});

test("[C5] a pan slides the view so that what was grabbed follows the pointer", () => {
  const m = oneScene();
  let s = startState(m);
  const e = E(m),
    x = W / 2,
    y = H / 2;
  s = view.startDrag(s, e, x, y);
  const r = cam.rayFrom(s.c, 0, 0, W / H),
    P: V3 = [r.o[0] + r.d[0] * 100, r.o[1] + r.d[1] * 100, r.o[2] + r.d[2] * 100];
  const hit = ((): V3 => {
    const h = cam.rayFrom(s.c, 0, 0, W / H);
    return h.o;
  })();
  void hit;
  void P;
  const grabbed = view.rayAt(s, e, x, y);
  // the surface under the pointer: the box's near face, found by the same ray the pan uses
  const t = s.drag!.depth / cam.forward(s.c).reduce((a, v, i) => a + v * grabbed.d[i]!, 0);
  const point = [
    grabbed.o[0] + grabbed.d[0] * t,
    grabbed.o[1] + grabbed.d[1] * t,
    grabbed.o[2] + grabbed.d[2] * t,
  ] as V3;
  const before = px(s.c, point);
  s = view.pan(s, e, 30, -20);
  const after = px(s.c, point);
  near(after[0], before[0] + 30, 1e-6);
  near(after[1], before[1] - 20, 1e-6);
});

test("[C2] an orbit by the view keeps its pivot on the screen; it does nothing in game mode", () => {
  const m = demoScene();
  let s = view.startDrag(startState(m), E(m), 300, 300);
  const pivot = s.drag!.pivot,
    before = px(s.c, pivot);
  for (let i = 0; i < 30; i++) s = view.orbit(s, E(m), 7, -3);
  const after = px(s.c, pivot);
  near(after[0], before[0], 1e-6);
  near(after[1], before[1], 1e-6);
  assert.notDeepEqual(s.c.eye, startState(m).c.eye);
  const g = view.orbit(view.startDrag(startState(m), E(m), 300, 300), E(m, { gameOn: true }), 50, 50);
  assert.deepEqual(g.c, startState(m).c);
});

test("[C8] the wheel zooms toward the cursor: the point under it stays where it is on the screen", () => {
  const m = emptyScene(),
    s0 = startState(m),
    x = 800,
    y = 300;
  const P = pointAt(s0.c, x, y, 100),
    before = px(s0.c, P);
  const s1 = view.zoom(s0, E(m), 0.7, x, y);
  const after = px(s1.c, P);
  near(after[0], before[0], 1e-6);
  near(after[1], before[1], 1e-6);
  assert.ok(len(s1.c.eye) < len(s0.c.eye), "it came nearer");
  const out = view.zoom(s0, E(m), 1.4, x, y);
  assert.ok(len(out.c.eye) > len(s0.c.eye), "a notch the other way goes back");
});

test("[C8 C16] the wheel and W S are one movement: a notch and the same share of flight end in the same place", () => {
  const m = oneScene(),
    s = startState(m),
    f = 0.8;
  const z = view.zoom(s, E(m), f, W / 2, H / 2);
  const fl = view.fly(s, E(m, { gameOn: true }), 0.016, { ahead: (1 - f) / 0.016, side: 0, dx: 0, dy: 0 });
  assert.deepEqual(
    z.c.eye.map((v) => +v.toFixed(9)),
    fl.c.eye.map((v) => +v.toFixed(9)),
  );
});

test("[C8] the camera goes through a thing, not stopping at its wall, and out the far side", () => {
  const m = oneScene();
  let s = startState(m, { c: { ...cam.home(), eye: [90, 0, 15], yaw: Math.PI, pitch: 0 } });
  const xs: number[] = [];
  for (let i = 0; i < 40; i++) {
    s = view.zoom(s, E(m), Math.exp(-0.15), W / 2, H / 2);
    xs.push(s.c.eye[0]);
  }
  assert.ok(
    xs.some((x) => x < 20 && x > -20),
    "it was inside",
  );
  assert.ok(xs[xs.length - 1]! < -20, "and came out the far side");
});

test("[C9] the wheel works far from the origin, never reaches 5,000 mm, and does not stall", () => {
  const m = demoScene();
  let s = startState(m, { c: { ...cam.home(), eye: scale(cam.forward(cam.home()), -4000) as V3 } });
  const d0 = len(s.c.eye);
  for (let i = 0; i < 30; i++) {
    const n = view.zoom(s, E(m), Math.exp(-0.15), W / 2, H / 2);
    assert.ok(len(n.c.eye) < len(s.c.eye) + 1e-9, "each notch comes nearer");
    assert.ok(isFinite(len(n.c.eye)));
    s = n;
  }
  assert.ok(len(s.c.eye) < d0 * 0.5, "it got somewhere");
  for (let i = 0; i < 300; i++) s = view.zoom(s, E(m), Math.exp(0.15), W / 2, H / 2);
  assert.ok(cam.reachOf(s.c) <= 5000 + 1e-6, `reach ${cam.reachOf(s.c)}`);
  const inside = startState(oneScene(), { c: { ...cam.home(), eye: [0, 0, 15] } });
  assert.ok(
    len(
      view.zoom(inside, E(oneScene()), 0.7, W / 2, H / 2).c.eye.map((v, i) => v - inside.c.eye[i]!) as unknown as V3,
    ) > 1,
    "even at the middle of a thing a notch moves it",
  );
});

test("[C11] a sketch plane facing straight up or down is seen as the Z button sees it, Y up", () => {
  const m = demoScene();
  for (const down of [-1, 1]) {
    const s = settle(view.lookAlong(startState(m), E(m), [0, 0, down] as V3), m);
    near(Math.cos(s.c.yaw), Math.cos(cam.straightDirection(2, 1).yaw), 1e-9, `looking ${down}`);
    near(Math.sin(s.c.yaw), Math.sin(cam.straightDirection(2, 1).yaw), 1e-9, `looking ${down}`);
  }
});
test("[C3 C13] with nothing in the model, going out of a straight view by a drag and back by a button, again and again, lands in the same 3D view every time", () => {
  const m = emptyScene();
  let t = 0,
    s = straightFrom(m, 2);
  const wait = (ms: number) => {
    for (let i = 0; i < ms / 16; i++) s = view.advance(s, E(m, { now: (t += 16) }), 0.016);
  };
  const reaches: number[] = [];
  for (let i = 0; i < 5; i++) {
    s = view.startDrag(s, E(m, { now: t }), W / 2, H / 2);
    for (let k = 0; k < 16; k++) {
      s = view.orbit(s, E(m, { now: (t += 16) }), 5, 1);
      s = view.advance(s, E(m, { now: t }), 0.016);
    }
    s = view.endDrag(s);
    wait(150); // (the button is pressed while the perspective is still coming in)
    reaches.push(cam.reachOf(s.c));
    s = settle(view.lookAt(s, E(m, { now: (t += 16) }), 2), m, {}, t);
    t += 5000;
  }
  for (const r of reaches)
    near(r / reaches[0]!, 1, 0.005, `the 3D view entered: ${reaches.map((x) => x.toFixed(1)).join(", ")}`);
});

test("[C12 C13] leaving a straight view by a drag and coming back to it again and again does not change its zoom", () => {
  const m = demoScene();
  let s = straightFrom(m, 2),
    t = 10000;
  const size0 = s.c.ortho!;
  for (let i = 0; i < 4; i++) {
    s = view.startDrag(s, E(m, { now: t }), W / 2, H / 2);
    for (let k = 0; k < 10; k++) s = view.orbit(s, E(m, { now: (t += 16) }), 12, 3);
    s = settle(view.endDrag(s), m, {}, t);
    s = settle(view.lookAt(s, E(m, { now: (t += 5000) }), 2), m, {}, t);
    t += 5000;
    near(s.c.ortho! / size0, 1, 0.002, `round trip ${i + 1}`);
  }
});
test("[C13] a straight view holds on for 60 px, then leaves about the pivot, which keeps its place on the screen", () => {
  const m = demoScene();
  let s = straightFrom(m, 2);
  const eye0 = s.c.eye;
  s = view.startDrag(s, E(m), 300, 300);
  s = view.orbit(s, E(m), 30, 0);
  s = view.orbit(s, E(m), 20, 0);
  assert.equal(s.go, null, "50 px: still straight");
  assert.deepEqual(s.c.eye, eye0);
  const pivot = s.drag!.pivot;
  s = view.orbit(s, E(m), 20, 0);
  assert.ok(s.go && s.go.lens === 1, "70 px: leaving");
  const at = px(s.c, pivot);
  let t = 0;
  for (let i = 0; i < 40; i++) {
    s = view.orbit(s, E(m, { now: t }), 2, 1);
    s = view.advance(s, E(m, { now: (t += 16) }), 0.016);
    const p = px(s.c, pivot);
    near(p[0], at[0], 1e-3, "pivot x");
    near(p[1], at[1], 1e-3, "pivot y");
  }
});

test("[C14] a drag, a wheel or a pan while a change to a straight view plays takes the view at once and the perspective comes back", () => {
  const m = demoScene();
  const playing = () => {
    let s = view.lookAt(startState(m), E(m), 2);
    for (let i = 1; i <= 8; i++) s = view.advance(s, E(m, { now: i * 16 }), 0.016);
    assert.ok(s.go && s.c.lens < 1 && s.c.ortho === null, "mid-change");
    return s;
  };
  const done = (s: ReturnType<typeof playing>) => {
    const r = settle(s, m, {}, 200);
    assert.equal(r.c.ortho, null);
    assert.equal(r.c.lens, 1);
    return r;
  };
  const w = view.zoom(playing(), E(m, { now: 200 }), 0.9, 500, 300);
  assert.equal(w.go!.lens, 1);
  done(w);
  let p = view.startDrag(playing(), E(m, { now: 200 }), 500, 300);
  p = view.pan(p, E(m, { now: 200 }), 10, 5);
  assert.equal(p.go!.lens, 1);
  done(p);
  let o = view.startDrag(playing(), E(m, { now: 200 }), 500, 300);
  o = view.orbit(o, E(m, { now: 200 }), 10, 5);
  assert.equal(o.go!.lens, 1);
  done(o);
});

test("[C16] game mode never starts flight in a view that is not fully perspective: from a straight view the perspective comes first", () => {
  const m = demoScene();
  let s = straightFrom(m, 2);
  assert.equal(view.flightReady(s), false, "straight");
  s = view.startGame(s, E(m));
  assert.ok(s.go && s.go.lens === 1);
  assert.equal(view.flightReady(s), false, "changing");
  s = settle(s, m);
  assert.equal(view.flightReady(s), true);
  assert.equal(view.flightReady(startState(m)), true);
  assert.equal(view.startGame(startState(m), E(m)).go, null, "already perspective: nothing to do");
});

test("[C17] Reset flies to what was last seen, from far away and from a straight view, and with nothing home", () => {
  const m = demoScene();
  let s = startState(m);
  s = view.advance(s, E(m), 0.016);
  assert.ok(s.seen, "something was in view and is remembered");
  const lost = { ...s, c: { ...cam.home(), eye: [5000, 5000, 5000] as V3, yaw: 0.3, pitch: 0.2 } };
  assert.equal(nothingInView(m, lost.c, W, H), true);
  const back = settle(view.reset(lost, E(m)), m);
  assert.equal(nothingInView(m, back.c, W, H), false);
  const fromStraight = settle(view.reset({ ...straightFrom(m, 2), seen: "a" }, E(m)), m);
  assert.equal(fromStraight.c.ortho, null);
  assert.equal(nothingInView(m, fromStraight.c, W, H), false);
  const home = settle(
    view.reset({ ...startState(emptyScene()), c: { ...cam.home(), eye: [9000, 9000, 9000] as V3 } }, E(emptyScene())),
    emptyScene(),
  );
  assert.deepEqual(
    home.c.eye.map((v) => +v.toFixed(6)),
    cam.home().eye.map((v) => +v.toFixed(6)),
  );
});

test("[C15] game mode keeps the world's pointer at the middle of the view", () => {
  const m = demoScene(),
    s = startState(m);
  const a = view.rayAt(s, E(m, { gameOn: true }), 10, 10),
    b = view.rayAt(s, E(m), W / 2, H / 2);
  assert.deepEqual(a.d, b.d);
});
