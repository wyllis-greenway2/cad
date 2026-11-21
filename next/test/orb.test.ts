import { test } from "node:test";
import assert from "node:assert/strict";
import { cam, near, W, H } from "./helpers.ts";
import { AXES, dragTo, handlesOf, hitHandle, startGrab, unitOf, type Orb } from "../src/orb.ts";
import { settings } from "../src/settings.ts";
import { add, dot, len, scale, sub, type V3 } from "../src/vec.ts";

const c0 = cam.home(), centre: V3 = [0, 0, 0], orb = (o: Partial<Orb> = {}): Orb => ({ centre, held: [], ...o });
const fwd = cam.forward(c0);
const px = (p: V3, c = c0) => { const q = cam.project(c, p, W, H); return [q.x, q.y] as const; };
const handle = (id: string, o: Orb = orb(), c = c0) => handlesOf(o, c).find((h) => h.id === id)!;
const mid = (id: string, o: Orb = orb()) => { const h = handle(id, o); return h.points[h.points.length >> 1]!; };

test("[O2 O3] on each axis a straight arrow out one side and a curved arrow (a stem to an open circle) out the other, and a ball", () => {
  const hs = handlesOf(orb(), c0);
  assert.deepEqual(hs.filter((h) => h.kind === "arrow").map((h) => h.id), ["move:X", "move:Y", "move:Z"]);
  assert.deepEqual(hs.filter((h) => h.kind === "turn").map((h) => h.id), ["turn:X", "turn:Y", "turn:Z"]);
  assert.equal(hs.filter((h) => h.kind === "ball").length, 1);
  AXES.forEach((d, i) => {
    const move = handle(`move:${"XYZ"[i]}`), turn = handle(`turn:${"XYZ"[i]}`);
    assert.ok(dot(sub(move.points[1]!, move.points[0]!), d) > 0, "the straight arrow goes out along +axis");
    assert.equal(turn.also?.length, 1, "the curved arrow has a stem");
    const stem = turn.also![0]!;
    assert.ok(dot(sub(stem[1]!, stem[0]!), d) < 0, "the stem goes out the other side, along -axis");
    // the circle is round the axis: every point of it is the same distance from the stem's end, and in the plane across the axis
    const end = stem[1]!, r0 = len(sub(turn.points[0]!, end));
    for (const p of turn.points) { near(len(sub(p, end)), r0, 1e-9); near(dot(sub(p, end), d), 0, 1e-9); }
    const span = Math.acos(dot(sub(turn.points[0]!, end), sub(turn.points.at(-1)!, end)) / (r0 * r0));
    assert.ok(span > 0.5 && span < Math.PI * 1.9, "it is open: it does not close on itself");
  });
});

test("[O14] every arrow and stem begins a little way out from the ball, so none runs into it", () => {
  const L = unitOf(c0, centre), ball = L * 0.064 * (settings.mover.headScale / 0.7);
  for (const h of handlesOf(orb(), c0)) {
    if (h.kind === "ball") continue;
    const starts = h.kind === "turn" ? [h.also![0]![0]!] : [h.points[0]!];
    for (const p of starts) assert.ok(len(sub(p, centre)) > ball, `${h.id} starts outside the ball`);
  }
});

test("[O4] the second arrows are off unless an operation asks for them, and then stand beyond the end of each straight arrow", () => {
  assert.equal(handlesOf(orb(), c0).some((h) => h.extra), false);
  const hs = handlesOf(orb({ extras: true }), c0), extras = hs.filter((h) => h.extra);
  assert.deepEqual(extras.map((h) => h.id), ["copy:X", "copy:Y", "copy:Z"]);
  for (const e of extras) { const m = handle(e.id.replace("copy", "move"), orb({ extras: true })); assert.ok(len(sub(e.points[0]!, centre)) > len(sub(m.points[1]!, centre))); }
});

test("[O8] the orb is the same size on the screen wherever the eye is", () => {
  const size = (d: number) => { const c = { ...c0, eye: add(centre, scale(fwd, -d)) }, h = handle("move:X", orb(), c), a = cam.project(c, h.points[0]!, W, H), b = cam.project(c, h.points[1]!, W, H); return Math.hypot(a.x - b.x, a.y - b.y); };
  near(size(30) / size(300), 1, 0.02);
  near(size(30) / size(3000), 1, 0.02);
});

test("[O2 O10] the pointer takes the handle nearest it, the ball a little more easily, and nothing when it is far", () => {
  const h = handlesOf(orb(), c0);
  const at = (p: V3) => px(p);
  assert.equal(hitHandle(h, c0, W, H, ...at(mid("move:X")))?.id, "move:X");
  assert.equal(hitHandle(h, c0, W, H, ...at(mid("turn:Z")))?.id, "turn:Z");
  assert.equal(hitHandle(h, c0, W, H, ...at(centre))?.id, "ball");
  assert.equal(hitHandle(h, c0, W, H, 5, 5), null);
});

test("[O2] dragging a straight arrow moves along its axis by how far the pointer went along it, and only along it", () => {
  const g = startGrab(orb(), handle("move:X"), c0, W, H, ...px(mid("move:X")), fwd)!;
  for (const dist of [10, -7, 25]) {
    const d = dragTo(g, c0, W, H, ...px(add(mid("move:X"), [dist, 0, 0])))!;
    near(d.move![0]!, dist, 0.02); near(d.move![1]!, 0, 1e-6); near(d.move![2]!, 0, 1e-6);
  }
});

test("[O3] dragging a curved arrow turns about its axis by the angle the pointer goes round it", () => {
  // the turn is measured in the plane across the axis through the orb's middle: points of that plane are where the angle is exact
  const R = 8, g = startGrab(orb(), handle("turn:Z"), c0, W, H, ...px([R, 0, 0]), fwd)!;
  for (const a of [0.5, -0.9, 2.0]) {
    const d = dragTo(g, c0, W, H, ...px([R * Math.cos(a), R * Math.sin(a), 0]))!;
    near(d.turn!.angle, a, 1e-6); near(Math.abs(dot(d.turn!.axis, [0, 0, 1])), 1, 1e-9);
  }
});

test("[O2 O6] the ball moves freely across the view; two held axes move in their plane, three freely across the view", () => {
  const ball = handle("ball"), start = px(centre);
  const g = startGrab(orb(), ball, c0, W, H, ...start, fwd)!, d = dragTo(g, c0, W, H, start[0] + 40, start[1] + 25)!;
  near(dot(d.move!, fwd), 0, 1e-6); assert.ok(len(d.move!) > 1);
  const two = startGrab(orb({ held: [0, 1] }), handle("move:X"), c0, W, H, ...px(mid("move:X")), fwd)!, d2 = dragTo(two, c0, W, H, 300, 300)!;
  near(d2.move![2]!, 0, 1e-6); assert.ok(len(d2.move!) > 1, "it went in the XY plane, and the third axis stayed");
  const three = startGrab(orb({ held: [0, 1, 2] }), handle("move:Y"), c0, W, H, ...px(mid("move:Y")), fwd)!, d3 = dragTo(three, c0, W, H, 300, 300)!;
  near(dot(d3.move!, fwd), 0, 1e-6);
});

test("[O1 O12] the arrows follow the orb's own axes when it has been turned", () => {
  const th = Math.PI / 5, frame: V3[] = [[Math.cos(th), Math.sin(th), 0], [-Math.sin(th), Math.cos(th), 0], [0, 0, 1]];
  const m = handle("move:X", orb({ frame }));
  const dir = sub(m.points[1]!, m.points[0]!);
  near(Math.abs(dot(dir, frame[0]!)) / len(dir), 1, 1e-9);
  const g = startGrab(orb({ frame }), m, c0, W, H, ...px(mid("move:X", orb({ frame }))), fwd)!, d = dragTo(g, c0, W, H, ...px(add(mid("move:X", orb({ frame })), scale(frame[0]!, 12))))!;
  near(dot(d.move!, frame[0]!), 12, 0.03);
});
