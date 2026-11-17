import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Plane } from "../src/operation/part.ts";
import { loopPoints } from "../src/operation/part.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";
import type { CamSpec } from "../src/operation/cams.ts";
import { camShapes } from "../src/operation/cams.ts";
import { camFace } from "../src/operation/camscene.ts";
import { wheelPoints } from "../src/operation/ratchet.ts";
import { armCam, typeKey, finish, camSpecOf } from "../src/interaction/tools.ts";
import type { Tool } from "../src/interaction/tools.ts";

await kernel.init();
const XY = worldRef("XY");
const spec = (over: Partial<CamSpec> = {}): CamSpec => ({ kind: "ratchet", teeth: 16, diameter: 60, depth: 4, hook: 0, hole: 10, pawl: 40, width: 8, lift: 0, ...over });
const area = (pts: readonly (readonly number[])[]): number => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]!; a += p[0]! * q[1]! - q[0]! * p[1]!; }); return Math.abs(a) / 2; };
const volume = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const make = (sp: CamSpec, at: [number, number, number] = [0, 0, 0], turn = 0) => {
  const s = createSession(kernel);
  const { turn: deg, ...cam } = sp; // (the turn is the record's, in radians)
  const t = turn + ((deg ?? 0) * Math.PI) / 180;
  const rec = { id: "g_001", plane: XY, at, spec: { teeth: 1, module: 1, cam }, ...(t ? { turn: t } : {}) };
  const made = run(s, { type: "gear", ...rec });
  assert.ok(!made.message, made.message ?? "");
  return { s: made, select: [camFace(rec)!] };
};

test("the wheel has a tip and a root for each tooth, the face straight down with no hook and leaning with one", () => {
  const plain = wheelPoints(16, 30, 4, 0);
  assert.ok(plain.ok && plain.value.length === 32);
  const [tip, root] = [plain.value![0]!, plain.value![1]!];
  assert.ok(Math.abs(Math.hypot(...tip) - 30) < 1e-9 && Math.abs(Math.hypot(...root) - 26) < 1e-9);
  assert.ok(Math.abs(Math.atan2(root[1], root[0])) < 1e-9, "radial: the root is at the tip's angle");
  const hooked = wheelPoints(16, 30, 4, 15);
  assert.ok(hooked.ok);
  const [t2, r2] = [hooked.value![0]!, hooked.value![1]!];
  const v = [r2[0] - t2[0], r2[1] - t2[1]];
  const cosLean = (-v[0]!) / Math.hypot(v[0]!, v[1]!); // the angle between the face and "straight to the centre" (-x from (30, 0))
  assert.ok(Math.abs(Math.acos(cosLean) - (15 * Math.PI) / 180) < 1e-6, `${Math.acos(cosLean)}`);
  assert.ok(r2[1] < 0, "the root is behind the tip (clockwise): the tip overhangs the gap");
  assert.equal(wheelPoints(16, 30, 4, 80).ok, false);
});

test("the wheel extrudes to its area less the shaft's hole, and the pawl is a second body-sized shape beside it", () => {
  const { s, select } = make(spec({ pawl: 0 }));
  const face = scene(s).parts[select[0] as never] as unknown as { loop: string[]; corners: string[] };
  const outline = loopPoints((r) => scene(s).parts[r], face.loop as never, face.corners as never);
  const op = startOp(scene(s), [select[0] as never], "extrude");
  assert.ok(op.ok);
  const made = runOp(s, { ...(op as { op: Op }).op, value: 5 })!.session;
  const want = (area(outline) - Math.PI * 25) * 5;
  assert.ok(Math.abs(volume(made) - want) / want < 0.002, `${volume(made)} vs ${want}`);
  // the area, exactly: each tooth is two triangles from the shaft (tip to root: none, a radial face; root to the next tip: half of 26 x 30 x sin of the pitch)
  assert.ok(Math.abs(area(outline) - 8 * 26 * 30 * Math.sin((2 * Math.PI) / 16)) < 1e-6 * area(outline));
});

test("the pawl rests on the face, its pivot on the tangent at the contact, and it crosses nothing of the wheel", () => {
  const r = camShapes(spec());
  assert.ok(r.ok && r.value.polys && r.value.polys.length === 2);
  const [wheel, pawl] = r.value.polys!;
  const pivot = r.value.circles.find((c) => c.hole && Math.hypot(...c.c) > 1)!;
  assert.ok(pivot, "the pivot hole is drawn at the pivot");
  assert.ok(pawl!.bulges.some((b) => b !== 0), "the boss is an arc");
  // the nose is on the face (the radial line at angle 0, from the tip at 30 to the root at 26): two corners of the pawl lie on it, within the face, and the rest of the pawl is on the gap's side (y > 0)
  const nose = pawl!.points.filter((p) => Math.abs(p[1]) < 1e-9 && p[0] > 26 - 1e-9 && p[0] < 30 - 1e-9);
  assert.equal(nose.length, 2, `${JSON.stringify(pawl!.points.slice(0, 4))}`);
  assert.ok(pawl!.points.every((p) => p[1] > -1e-9), "the pawl is in the gap, not in the tooth");
  // the arm runs along the tangent from the foot of the nose: its length along the tangent is as asked, and the boss's middle is half a boss above that line
  const foot = nose.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0]!; // (the lower end of the contact: the nearer to the shaft)
  const out = [foot[0] / Math.hypot(...foot), foot[1] / Math.hypot(...foot)];
  const along = [-out[1]!, out[0]!];
  const arm = [pivot.c[0] - foot[0], pivot.c[1] - foot[1]];
  assert.ok(Math.abs(arm[0]! * along[0]! + arm[1]! * along[1]! - 40) < 1e-6, "the arm is as long as asked, along the tangent");
  assert.ok(Math.abs(arm[0]! * out[0]! + arm[1]! * out[1]! - 4) < 1e-6, "the boss rests on the tangent line (its middle is its radius above it)");
  // no corner of the wheel inside the pawl
  const inside = (poly: number[][], q: number[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = [poly[i]!, poly[j]!]; if ((a[1]! > q[1]!) !== (b[1]! > q[1]!) && q[0]! < ((b[0]! - a[0]!) * (q[1]! - a[1]!)) / (b[1]! - a[1]!) + a[0]!) c = !c; } return c; };
  assert.ok(!wheel!.points.some((q) => inside(pawl!.points, q)));
});

test("both are drawn as faces that extrude, and the Angle turns the whole drawing about the shaft", () => {
  const plain = make(spec());
  const faces = Object.values(scene(plain.s).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk);
  assert.equal(faces.length, 2, "the wheel and the pawl");
  const turned = make(spec({ turn: 90 }));
  const tips = (st: ReturnType<typeof createSession>) => Object.values(scene(st).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at);
  const [a, b] = [tips(plain.s), tips(turned.s)];
  assert.equal(a.length, b.length);
  // a quarter turn: every corner (x, y) goes to (-y, x)
  for (const [x, y] of a) assert.ok(b.some((q) => Math.abs(q[0]! + y!) < 1e-6 && Math.abs(q[1]! - x!) < 1e-6));
});

test("what cannot be made says why: too few teeth, a hole into the roots, a pawl that cannot reach", () => {
  assert.match(String((camShapes(spec({ teeth: 2 })) as { error?: string }).error), /3 to 200/);
  assert.match(String((camShapes(spec({ hole: 54 })) as { error?: string }).error), /hole/);
  assert.match(String((camShapes(spec({ pawl: 2, width: 8 })) as { error?: string }).error), /pawl/);
  assert.match(String((camShapes(spec({ hook: 45 })) as { error?: string }).error), /hook/);
});

test("the tool: teeth, diameter and the rest are typed, Tab goes between the eight, and Enter draws the wheel and the pawl", () => {
  const s = createSession(kernel);
  let t: Tool = { ...armCam("ratchet"), plane: XY, points: [[0, 0, 0]], cursor: [30, 0, 0] };
  const sp0 = camSpecOf(t)!;
  assert.deepEqual([sp0.teeth, sp0.diameter, sp0.hook, sp0.turn], [20, 60, 0, 0]);
  assert.ok(Math.abs(sp0.depth! - 0.4 * ((Math.PI * 60) / 20)) < 1e-9);
  for (const k of ["1", "6", "Tab", "6", "0", "Tab", "4", "Tab", "1", "0"]) t = typeKey(t, k);
  const sp = camSpecOf(t)!;
  assert.deepEqual([sp.teeth, sp.diameter, sp.depth, sp.hook], [16, 60, 4, 10]);
  const fin = finish(scene(s), t);
  assert.ok(fin, "made");
  const made = run(s, fin!.command);
  assert.equal(Object.values(scene(made).parts).filter((p) => p.kind === "face" && !(p as { disk?: string }).disk).length, 2);
});
