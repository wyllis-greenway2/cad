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
import { genevaCentres } from "../src/operation/geneva.ts";
import { camFace, camRefs } from "../src/operation/camscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { armCam, typeKey, finish, camSpecOf } from "../src/interaction/tools.ts";
import type { Tool } from "../src/interaction/tools.ts";

await kernel.init();
const XY = worldRef("XY");
const spec = (over: Partial<CamSpec> = {}): CamSpec => ({ kind: "geneva", teeth: 4, diameter: 20, crank: 10, pin: 2.5, clearance: 0.3, hole: 2.5, lift: 0, ...over });
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
  // the disc less four slots: w = 2.5 + 0.6 wide, from the rounded end at 4.14 out to the rim at 12.5
  const [w, sm, sc, rw] = [3.1, Math.sqrt(12.5 ** 2 - 3.1 ** 2 / 4), 14.142135623730951 - 10, 12.5];
  const slot = w * (sm - sc) + (Math.PI * (w / 2) ** 2) / 2;
  assert.ok(Math.abs(area(outline) - (Math.PI * rw * rw - 4 * slot)) / area(outline) < 0.02, `${area(outline)}`);
});

test("the crank is drawn below the wheel, with a hub, an arm as wide as the pin and the pin's circle; both have their shaft's hole", () => {
  const sh = camShapes(spec());
  assert.ok(sh.ok && sh.value.polys?.length === 2 && sh.value.circles.length === 2);
  const crank = sh.value.polys![1]!;
  assert.ok(crank.points.every((q) => q[1] < -12.5), "below the wheel's rim");
  const hub = sh.value.circles[1]!;
  assert.ok(hub.c[0] === 0 && hub.c[1] < -12.5 && hub.hole);
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

test("the tool: slots, crank, pin, clearance and hole; the title says how far apart the shafts are; the numbers can be edited", async () => {
  const s = createSession(kernel);
  let t: Tool = { ...armCam("geneva"), plane: XY, points: [[0, 0, 0]], cursor: [10, 0, 0] };
  const sp0 = camSpecOf(t)!;
  assert.deepEqual([sp0.teeth, sp0.crank, sp0.pin, sp0.clearance, sp0.hole], [4, 10, 2.5, 0.3, 2.5]);
  for (const k of ["6", "Tab", "1", "2"]) t = typeKey(t, k);
  assert.deepEqual([camSpecOf(t)!.teeth, camSpecOf(t)!.crank], [6, 12]);
  const fin = finish(scene(s), t);
  assert.ok(fin);
  const made = run(s, fin!.command);
  assert.equal(Object.values(scene(made).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length, 2);
  const { entryOf } = await import("../src/interaction/entry.ts");
  const e = entryOf(scene(s), t, null)!;
  assert.match(e.panel!, /Geneva wheel and crank, shafts 24 mm apart/); // 12 / sin(30 degrees) = 24
  assert.deepEqual(e.fields.map((f) => f.label), ["Slots", "Crank", "Pin", "Clearance", "Hole"]);
  void loopFaceRef;
});
