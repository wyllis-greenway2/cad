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
import { camFace, camRefs } from "../src/operation/camscene.ts";
import { armCam, typeKey, finish, camSpecOf, editCamTool } from "../src/interaction/tools.ts";
import type { Tool } from "../src/interaction/tools.ts";

await kernel.init();
const XY = worldRef("XY");
const spec = (over: Partial<CamSpec> = {}): CamSpec => ({ kind: "linear", teeth: 8, diameter: 0, pitch: 6, depth: 2.4, hook: 0, base: 4, hole: 0, pawl: 20, width: 5, lift: 0, ...over });
const area = (pts: readonly (readonly number[])[]): number => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]!; a += p[0]! * q[1]! - q[0]! * p[1]!; }); return Math.abs(a) / 2; };
const volume = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const make = (sp: CamSpec) => {
  const { turn: deg, ...cam } = sp;
  const rec = { id: "g_001", plane: XY, at: [0, 0, 0] as [number, number, number], spec: { teeth: 1, module: 1, cam }, ...(deg ? { turn: (deg * Math.PI) / 180 } : {}) };
  const s = run(createSession(kernel), { type: "gear", ...rec });
  assert.ok(!s.message, s.message ?? "");
  return { s, rec };
};

test("the bar has a tip and a root for each tooth, tips on the line y = 0, roots a depth below, the face straight down with no hook and leaning back with one", () => {
  const sh = camShapes(spec());
  assert.ok(sh.ok);
  const bar = sh.value.polys![0]!.points;
  assert.equal(bar.length, 2 + 2 * 8 + 1, "two bottom corners, a root at the left end, a tip and a root for each tooth");
  const tips = bar.filter((p) => Math.abs(p[1]) < 1e-9);
  assert.equal(tips.length, 8);
  tips.sort((a, b) => a[0] - b[0]).forEach((p, i) => assert.ok(Math.abs(p[0] - 6 * (i + 1)) < 1e-9, "a pitch apart"));
  assert.ok(bar.filter((p) => Math.abs(p[1] + 2.4) < 1e-9).length === 9, "a root for each tooth and one at the left end");
  const hooked = camShapes(spec({ hook: 20 }));
  assert.ok(hooked.ok);
  const behind = 2.4 * Math.tan((20 * Math.PI) / 180);
  const hb = hooked.value.polys![0]!.points;
  for (const tip of hb.filter((p) => Math.abs(p[1]) < 1e-9)) assert.ok(hb.some((r) => Math.abs(r[1] + 2.4) < 1e-9 && Math.abs(r[0] - (tip[0] - behind)) < 1e-9), "the face's root is behind its tip");
});

test("the bar extrudes to its exact area (the teeth are half the depth over the pitch, plus the base)", () => {
  const { s, rec } = make(spec({ pawl: 0 }));
  const face = camFace(rec)!;
  const op = startOp(scene(s), [face as never], "extrude");
  assert.ok(op.ok, JSON.stringify(op));
  const made = runOp(s, { ...(op as { op: Op }).op, value: 5 })!.session;
  assert.ok(!made.message, made.message ?? "");
  const want = 8 * 6 * (4 + 2.4 / 2) * 5; // (length x (base + half the depth) x thickness)
  assert.ok(Math.abs(volume(made) - want) / want < 0.002, `${volume(made)} vs ${want}`);
  const f = scene(s).parts[face as never] as unknown as { loop: string[]; corners: string[] };
  assert.ok(Math.abs(area(loopPoints((r) => scene(s).parts[r], f.loop as never, f.corners as never)) * 5 - want) / want < 1e-6);
});

test("the pawl rests on the face of the middle tooth from the gap's side, its arm's lower edge on a line from the foot of the nose, and it crosses nothing of the bar", () => {
  const sh = camShapes(spec());
  assert.ok(sh.ok && sh.value.polys!.length === 2);
  const [bar, pawl] = sh.value.polys!;
  const faceX = 4 * 6; // (the middle tooth, the fourth: its tip at x = 24, the face straight down to the root)
  const nose = pawl!.points.filter((p) => Math.abs(p[0] - faceX) < 1e-9 && p[1] < 1e-9 && p[1] > -2.4 - 1e-9);
  assert.equal(nose.length, 2, `${JSON.stringify(pawl!.points.slice(0, 3))}`);
  assert.ok(pawl!.points.every((p) => p[0] >= faceX - 1e-9), "the pawl is in the gap, on the +x side of the face, not in the tooth");
  assert.ok(pawl!.bulges.some((b) => b !== 0), "the boss is an arc");
  const pivot = sh.value.circles[0]!;
  const foot = nose.sort((a, b) => a[1] - b[1])[0]!; // (the lower end of the contact)
  const d = Math.hypot(pivot.c[0] - foot[0], pivot.c[1] - foot[1]);
  assert.ok(Math.abs(d - Math.hypot(20, 2.5)) < 1e-6, `the pivot is an arm along its line and half a boss above it: ${d}`);
  assert.ok(Math.abs(pivot.r - 1.25) < 1e-9, "the pivot hole is half the boss's width");
  // nothing of the bar inside the pawl
  const inside = (poly: number[][], q: number[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = [poly[i]!, poly[j]!]; if ((a[1]! > q[1]!) !== (b[1]! > q[1]!) && q[0]! < ((b[0]! - a[0]!) * (q[1]! - a[1]!)) / (b[1]! - a[1]!) + a[0]!) c = !c; } return c; };
  assert.ok(!bar!.points.some((q) => inside(pawl!.points, q)));
  assert.ok(pawl!.points.every((p) => p[1] > -2.4 - 1e-9), "above the roots");
});

test("both are drawn as faces that extrude, with the pivot hole as a circle; the Angle turns the whole drawing", () => {
  const { s, rec } = make(spec());
  const faces = Object.values(scene(s).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk);
  assert.equal(faces.length, 2, "the bar and the pawl");
  assert.equal(Object.values(scene(s).parts).filter((p) => p.kind === "circle").length, 1, "the pivot hole");
  assert.equal(camRefs(rec).lines.length, 2 * 8 + 3, "the bar's sides");
  const turned = make(spec({ turn: 90 })).s;
  const corners = (st: ReturnType<typeof createSession>) => Object.values(scene(st).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at);
  const [a, b] = [corners(s), corners(turned)];
  assert.equal(a.length, b.length);
  for (const [x, y] of a) assert.ok(b.some((q) => Math.abs(q[0]! + y!) < 1e-6 && Math.abs(q[1]! - x!) < 1e-6), "a quarter turn: (x, y) to (-y, x)");
});

test("what cannot be made says why: too few teeth, no pitch, teeth too deep, a hook too big, no base, a pawl that cannot reach", () => {
  const why = (o: Partial<CamSpec>) => String((camShapes(spec(o)) as { error?: string }).error);
  assert.match(why({ teeth: 1 }), /2 to 200/);
  assert.match(why({ pitch: 0 }), /pitch/);
  assert.match(why({ depth: 12 }), /depth/);
  assert.match(why({ hook: 40 }), /hook/);
  assert.match(why({ base: 0 }), /base/);
  assert.match(why({ pawl: 0.5, width: 8 }), /pawl/);
});

test("the tool: teeth, pitch (from the pointer), depth, hook, base, pawl, width and angle; Enter draws the bar and the pawl; Edit reads the numbers back", () => {
  const s = createSession(kernel);
  let t: Tool = { ...armCam("linear"), plane: XY, points: [[0, 0, 0]], cursor: [50, 0, 0] };
  const sp0 = camSpecOf(t)!;
  assert.deepEqual([sp0.teeth, sp0.pitch, sp0.depth, sp0.hook, sp0.base, sp0.pawl, sp0.width, sp0.turn], [10, 5, 2, 0, 3, 15, 4, 0]);
  for (const k of ["8", "Tab", "6", "Tab", "2", ".", "4"]) t = typeKey(t, k);
  const sp = camSpecOf(t)!;
  assert.deepEqual([sp.teeth, sp.pitch, sp.depth], [8, 6, 2.4]);
  const fin = finish(scene(s), t);
  assert.ok(fin, "made");
  const made = run(s, fin!.command);
  assert.equal(Object.values(scene(made).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length, 2);
  const et = editCamTool(scene(made).gears![0]!);
  assert.deepEqual(et.cam!.typed.slice(0, 3), ["8", "6", "2.4"]);
});
