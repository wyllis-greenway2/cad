import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";
import { loopPoints } from "../src/operation/part.ts";
import type { CamSpec } from "../src/operation/cams.ts";
import { camShapes } from "../src/operation/cams.ts";
import { genevaCentres, genevaWheelRadius, outlinePoints } from "../src/operation/geneva.ts";
import { splinePoints } from "../src/operation/spline.ts";
import { camFace, camRefs } from "../src/operation/camscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { armCam, typeKey, finish, camSpecOf } from "../src/interaction/tools.ts";
import type { Tool } from "../src/interaction/tools.ts";

await kernel.init();
const XY = worldRef("XY");
const spec = (over: Partial<CamSpec> = {}): CamSpec => ({ kind: "geneva", teeth: 4, diameter: 20, crank: 10, pin: 2.5, clearance: 0.3, hole: 2.5, lock: 0, lift: 0, ...over });
const volume = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const make = (sp: CamSpec) => {
  const rec = { id: "g_001", plane: XY, at: [0, 0, 0] as [number, number, number], spec: { teeth: 1, module: 1, cam: sp } };
  const s = run(createSession(kernel), { type: "gear", ...rec });
  assert.ok(!s.message, s.message ?? "");
  return { s, rec };
};
const area = (pts: readonly (readonly number[])[]): number => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]!; a += p[0]! * q[1]! - q[0]! * p[1]!; }); return Math.abs(a) / 2; };

test("the centre distance is the crank radius over the sine of half a step: the pin enters each slot straight", () => {
  for (const n of [3, 4, 5, 6, 8, 12]) {
    const [a, c] = [10, genevaCentres(n, 10)];
    assert.ok(Math.abs(c * Math.sin(Math.PI / n) - a) < 1e-12);
    // the angle at the pin between the crank's centre and the wheel's centre is a right angle when the pin enters (a, b and c make a right triangle)
    const b = c * Math.cos(Math.PI / n);
    assert.ok(Math.abs(a * a + b * b - c * c) < 1e-9, `n=${n}`);
  }
  assert.ok(Math.abs(genevaCentres(4, 10) - 14.142135623730951) < 1e-12);
});

test("the drive works: over the engagement the pin stays in its slot, and the wheel turns exactly one step", () => {
  for (const n of [4, 5, 6, 8]) {
    const [a, p, clr] = [10, 2.5, 0.3];
    const c = genevaCentres(n, a);
    const beta = Math.PI / 2 - Math.PI / n; // the crank's turn each side of the line of centres while the pin is in the slot
    const pin = (al: number): [number, number] => [c - a * Math.cos(al), a * Math.sin(al)];
    const turnAt = (al: number) => { const [x, y] = pin(al); return Math.atan2(y, x); }; // the wheel's turn: the slot's axis points at the pin
    assert.ok(Math.abs(turnAt(beta) - turnAt(-beta) - (2 * Math.PI) / n) < 1e-9, `one step, n=${n}`);
    const sh = camShapes(spec({ teeth: n }));
    assert.ok(sh.ok, sh.ok ? "" : (sh as { error: string }).error);
    const rw = c * Math.cos(Math.PI / n) + p; // the wheel's radius
    for (let k = 0; k <= 20; k++) {
      const al = -beta + (2 * beta * k) / 20;
      const [x, y] = pin(al);
      const dist = Math.hypot(x, y);
      assert.ok(dist >= c - a - 1e-9 && dist <= c * Math.cos(Math.PI / n) + 1e-9, "the pin is between its nearest approach and where it enters");
      assert.ok(dist + p / 2 + clr <= rw + 1e-9 || dist <= rw, "inside the wheel's rim");
    }
    void clr;
  }
});

test("the wheel has a slot for each step, and extrudes to the disc less the slots and the shaft's hole", () => {
  const { s, rec } = make(spec());
  const refs = camRefs(rec);
  assert.equal(refs.lines.length, 16, "four sides to each of four slots");
  assert.ok(refs.bore);
  const face = camFace(rec)!;
  const f = scene(s).parts[face as never] as unknown as { loop: string[]; corners: string[] };
  const outline = loopPoints((r) => scene(s).parts[r], f.loop as never, f.corners as never);
  const op = startOp(scene(s), [face as never], "extrude");
  assert.ok(op.ok, JSON.stringify(op));
  const made = runOp(s, { ...(op as { op: Op }).op, value: 3 })!.session;
  assert.ok(!made.message, made.message ?? "");
  const want = (area(outline) - Math.PI * 1.25 ** 2) * 3; // (the shaft's hole: diameter 2.5)
  assert.ok(Math.abs(volume(made) - want) / want < 0.005, `${volume(made)} vs ${want}`);
  // the disc less four slots: w = 2.5 + 0.6 wide, from the rounded end at 4.14 out to the rim
  const rw = genevaWheelRadius(4, 10, 2.5, 0.3);
  const [w, sm, sc] = [3.1, Math.sqrt(rw * rw - 3.1 ** 2 / 4), 14.142135623730951 - 10];
  const slot = w * (sm - sc) + (Math.PI * (w / 2) ** 2) / 2;
  assert.ok(Math.abs(area(outline) - (Math.PI * rw * rw - 4 * slot)) / area(outline) < 0.02, `${area(outline)}`);
});

test("the crank is drawn below the wheel, with a hub, an arm as wide as the pin and the pin's circle; both have their shaft's hole", () => {
  const sh = camShapes(spec());
  assert.ok(sh.ok && sh.value.polys?.length === 2 && sh.value.circles.length === 2);
  const crank = sh.value.polys![1]!;
  const rwd = genevaWheelRadius(4, 10, 2.5, 0.3);
  assert.ok(crank.points.every((q) => q[1] < -rwd), "below the wheel's rim");
  const hub = sh.value.circles[1]!;
  assert.ok(hub.c[0] === 0 && hub.c[1] < -rwd && hub.hole);
  const { s } = make(spec());
  assert.equal(Object.values(scene(s).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length, 2, "two figures: the wheel and the crank");
});

test("what cannot be made says why: the number of slots, a slot into the shaft's hole, slots that meet, a pin as wide as the circle", () => {
  const why = (o: Partial<CamSpec>) => String((camShapes(spec(o)) as { error?: string }).error);
  assert.match(why({ teeth: 2 }), /3 to 24/);
  assert.match(why({ hole: 8 }), /shaft/);
  assert.match(why({ teeth: 3, pin: 6 }), /reach|meet/);
  assert.match(why({ pin: 20 }), /pin/);
});

test("the tool: slots, crank, pin, clearance, hole and lock; the title says how far apart the shafts are; the numbers can be edited", async () => {
  const s = createSession(kernel);
  let t: Tool = { ...armCam("geneva"), plane: XY, points: [[0, 0, 0]], cursor: [10, 0, 0] };
  const sp0 = camSpecOf(t)!;
  assert.deepEqual([sp0.teeth, sp0.crank, sp0.pin, sp0.clearance, sp0.hole, sp0.lock], [4, 10, 2.5, 0.3, -1, undefined]);
  for (const k of ["6", "Tab", "1", "2"]) t = typeKey(t, k);
  assert.deepEqual([camSpecOf(t)!.teeth, camSpecOf(t)!.crank], [6, 12]);
  const fin = finish(scene(s), t);
  assert.ok(fin);
  const made = run(s, fin!.command);
  assert.equal(Object.values(scene(made).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length, 3, "the wheel, the crank and the locking disc");
  const { entryOf } = await import("../src/interaction/entry.ts");
  const e = entryOf(scene(s), t, null)!;
  assert.match(e.panel!, /Geneva wheel and crank, shafts 24 mm apart/); // 12 / sin(30 degrees) = 24
  assert.deepEqual(e.fields.map((f) => f.label), ["Slots", "Crank", "Pin", "Clearance", "Hole", "Lock"]);
  // edited: the numbers as they are, an automatic hole and lock left empty so they stay automatic
  const { editCamTool } = await import("../src/interaction/tools.ts");
  const rec = scene(made).gears![0]!;
  const et = editCamTool(rec);
  assert.deepEqual(et.cam!.typed, ["6", "12", "3", "0.3", "", ""]);
  void loopFaceRef;
});

// ---- the locking disc (`in_702`)
type Pt = [number, number];
const turned = (poly: Pt[], a: number): Pt[] => poly.map(([x, y]): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
const crossing = (p: Pt, q: Pt, r: Pt, s2: Pt): boolean => { const o = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return o(p, q, r) * o(p, q, s2) < 0 && o(r, s2, p) * o(r, s2, q) < 0; };
const inside = (poly: Pt[], q: Pt): boolean => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = [poly[i]!, poly[j]!]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const overlap = (a: Pt[], b: Pt[]): boolean => a.some((p, i) => b.some((q, j) => crossing(p, a[(i + 1) % a.length]!, q, b[(j + 1) % b.length]!))) || a.some((p) => inside(b, p)) || b.some((p) => inside(a, p));
/** the wheel and the locking disc as polygons, and the disc's own, from the shapes of a drive */
function drive(sp: CamSpec) {
  const sh = camShapes(sp);
  assert.ok(sh.ok, sh.ok ? "" : (sh as { error: string }).error);
  const wheel = outlinePoints(sh.value.polys![0]!.points, sh.value.polys![0]!.bulges) as Pt[];
  const ring = sh.value.rings![0]!.map((q): [number, number, number] => [q[0], q[1], 0]);
  const n = ring.length;
  const disc = splinePoints([...ring, ring[0]!], 16, { before: ring[n - 1]!, after: ring[1]! }).map((q): Pt => [q[0], q[1]]);
  const centre = sh.value.circles[2]!.c as Pt; // (the disc's shaft: its hole)
  return { wheel, local: disc.map(([x, y]): Pt => [x - centre[0], y - centre[1]]) };
}

test("the locking disc keeps the wheel still between visits and lets it turn during one: no overlap all the way round, and a turn either way is blocked", () => {
  for (const [n, a] of [[4, 20], [5, 20], [6, 20]] as const) {
    const sp = spec({ teeth: n, crank: a, pin: a / 4, diameter: 2 * a, hole: -1, lock: undefined });
    const { wheel, local } = drive(sp);
    const c = genevaCentres(n, a);
    const beta = Math.PI / 2 - Math.PI / n;
    const placed = (al: number): Pt[] => turned(local, Math.PI - al).map(([x, y]): Pt => [x + c, y]); // the disc turned with the crank
    let worst = 0;
    for (let k = 0; k < 360; k++) {
      const al = ((k / 360) * 2 * Math.PI + Math.PI) % (2 * Math.PI) - Math.PI; // the crank angle, -180 to 180 degrees
      const inWindow = Math.abs(al) <= beta;
      const turn = inWindow ? Math.atan2(a * Math.sin(al), c - a * Math.cos(al)) : Math.PI / n; // (the wheel's turn: the pin's, or where the visit left it)
      assert.ok(!overlap(turned(wheel, turn), placed(al)), `n=${n}: the wheel and the disc meet at crank angle ${((al * 180) / Math.PI).toFixed(0)}`);
      worst = Math.max(worst, k);
    }
    // locked: well away from the pin's visit, a turn of 3 degrees either way runs the wheel into the disc
    for (const al of [Math.PI, Math.PI - 0.3, -Math.PI + 0.3]) for (const dt of [-0.05, 0.05]) assert.ok(overlap(turned(wheel, Math.PI / n + dt), placed(al)), `n=${n}: a turn of ${dt} at ${al} is not blocked`);
    void worst;
  }
});

test("the locking disc is a face of its own, with its shaft's hole; Lock 0 has none, and the wheel's rim is plain round", () => {
  const withDisc = make(spec({ teeth: 5, crank: 20, pin: 5, diameter: 40, hole: -1, lock: undefined })).s;
  const faces = (st: ReturnType<typeof createSession>) => Object.values(scene(st).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length;
  assert.equal(faces(withDisc), 3, "the wheel, the crank and the locking disc");
  const without = make(spec({ teeth: 5, crank: 20, pin: 5, diameter: 40, hole: -1, lock: 0 })).s;
  assert.equal(faces(without), 2);
  const wheelOnly = camShapes(spec({ lock: 0 }));
  const withArcs = camShapes(spec({ lock: undefined, hole: -1, crank: 20, pin: 5, diameter: 40 }));
  assert.ok(wheelOnly.ok && withArcs.ok);
  assert.ok(withArcs.value.polys![0]!.points.length > wheelOnly.value.polys![0]!.points.length, "the locking arcs add corners to the wheel");
});

test("what a locking disc cannot be says why, and an automatic hole is as big as the room allows", () => {
  const e = (o: Partial<CamSpec>) => String((camShapes(spec({ crank: 20, pin: 5, diameter: 40, hole: -1, lock: undefined, ...o })) as { error?: string }).error);
  assert.match(e({ lock: 1 }), /locking disc/);
  assert.match(e({ lock: 60 }), /locking disc/);
  const auto = camShapes(spec({ teeth: 4, crank: 20, pin: 5, diameter: 40, hole: -1, lock: undefined }));
  assert.ok(auto.ok);
  assert.ok(Math.abs(auto.value.circles[0]!.r * 2 - 5) < 1e-6, "a quarter of the crank radius, where the room allows");
  assert.match(e({ hole: 20 }), /hole/);
});
