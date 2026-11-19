// Gears that turn each other about their own shafts (`in_1117`): a bevel, crown, spiral or face gear that was meshed stands on its own frame (not on the plane it shares with the gear it was made from), and a worm turns about its own length and turns its wheel.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { meshBevel, meshFace, meshWith } from "../src/operation/mesh.ts";
import { followersOf, gearAxis, axisOf } from "../src/operation/gearcouple.ts";
import { crownShaft } from "../src/operation/crown.ts";
import { bevelFrame } from "../src/operation/bevel.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";
import type { Scene } from "../src/operation/scene.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const XY = worldRef("XY");
const [U, V]: [Vec3, Vec3] = [[1, 0, 0], [0, 1, 0]];
const [sub, dot, len] = [(a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], (a: Vec3) => Math.hypot(...a)];
type Place = (src: GearRecord) => { ok: boolean; value?: { at: Vec3; turn: number; spec: GearSpec } };
/** a source gear at the origin and its partner as the tools place it, each with a (made up) body so that the coupling finds them */
function pair(spec: GearSpec, place: Place): Scene {
  let s = createSession(kernel);
  const src = { id: "g_001", plane: XY, at: [0, 0, 0] as Vec3, spec };
  s = run(s, { type: "gear", id: "g_001", plane: XY, at: src.at, spec } as never);
  assert.ok(!s.message, s.message ?? "");
  const p = place(src); assert.ok(p.ok);
  s = run(s, { type: "gear", id: "g_002", plane: XY, at: p.value!.at, spec: p.value!.spec, turn: p.value!.turn, meshWith: "g_001" } as never);
  assert.ok(!s.message, s.message ?? "");
  const sc = structuredClone(scene(s)) as { -readonly [K in keyof Scene]: Scene[K] } & { steps: unknown[]; parts: Record<string, unknown> };
  sc.gears!.forEach((g, i) => { sc.steps.push({ id: `s_9${i}`, type: "extrude", parts: [], params: { gear: g.id } } as never); sc.parts[`b${i}`] = { kind: "body", id: `x_s_9${i}`, ref: `b/x_s_9${i}/o` } as never; });
  return sc as unknown as Scene;
}
/** the angle (degrees) between the line that the two turns leave still (the instantaneous axis: the turn of the first less the turn of the second) and the first gear's shaft */
function restLine(sc: Scene): { k: number; angle: number; dir: Vec3; frame: Vec3 } {
  const [g1, g2] = sc.gears!;
  const f = followersOf(sc, g1!).followers[0]!;
  const n1 = axisOf(sc, g1!)!;
  const w2: Vec3 = [f.dir[0] * f.k, f.dir[1] * f.k, f.dir[2] * f.k];
  const d = sub(n1, w2);
  return { k: f.k, angle: (Math.acos(Math.abs(dot(d, n1)) / len(d)) * 180) / Math.PI, dir: f.dir, frame: axisOf(sc, g2!)! };
}
const cone = (z1: number, z2: number, shaft = 90) => (Math.atan2(Math.sin((shaft * Math.PI) / 180), z2 / z1 + Math.cos((shaft * Math.PI) / 180)) * 180) / Math.PI;

test("a bevel gear's partner turns about its own shaft, the other way round, and the pair rolls on its cones", () => {
  for (const [z1, z2] of [[20, 30], [30, 20], [24, 24]] as const) {
    const sc = pair({ teeth: z1, module: 2, backlash: 0.15, bevel: { mate: z2 } }, (src) => meshBevel(src, U, V, { teeth: z2 }, 0));
    const r = restLine(sc);
    assert.ok(Math.abs(dot(r.dir, r.frame) - 1) < 1e-9, "the shaft is the partner's own frame's");
    assert.ok(Math.abs(dot(r.dir, [0, 0, 1])) < 1e-9, "not the plane's normal it shares with the first gear");
    assert.ok(Math.abs(r.k + z1 / z2) < 1e-9, `k ${r.k}`);
    assert.ok(Math.abs(r.angle - cone(z1, z2)) < 1e-6, `rest line at ${r.angle}, the cone's half angle ${cone(z1, z2)}`);
  }
});
test("a crown gear and its pinion: the pinion's shaft is the one it stands on, and the rest line lies in the crown's flat pitch surface", () => {
  const sc = pair({ teeth: 40, module: 2, bore: 5, bevel: { mate: 18, shaft: crownShaft(40, 18) } }, (src) => meshBevel(src, U, V, { teeth: 18 }, 0));
  const r = restLine(sc);
  assert.ok(Math.abs(dot(r.dir, r.frame) - 1) < 1e-9);
  assert.ok(Math.abs(r.k + 40 / 18) < 1e-9, `k ${r.k}`);
  assert.ok(Math.abs(r.angle - 90) < 1e-6, `the crown's pitch angle is a right angle: ${r.angle}`);
});
test("a spiral bevel pair turns like a straight one", () => {
  const sc = pair({ teeth: 20, module: 2, bore: 5, bevel: { mate: 30, spiral: 30 } }, (src) => meshBevel(src, U, V, { teeth: 30 }, 0));
  const r = restLine(sc);
  assert.ok(Math.abs(r.angle - cone(20, 30)) < 1e-6 && r.k < 0);
});
test("a face gear and its pinion turn the same way about their own shafts by the ratio of the teeth", () => {
  const a = pair({ teeth: 40, module: 2, bore: 5, bevel: { mate: 14, facegear: "gear" } }, (src) => meshFace(src, U, V, { teeth: 14 }, 0));
  const [fa, fb] = [followersOf(a, a.gears![0]!).followers[0]!, axisOf(a, a.gears![1]!)!];
  assert.ok(Math.abs(fa.k - 40 / 14) < 1e-9 && Math.abs(dot(fa.dir, fb) - 1) < 1e-9);
  const b = pair({ teeth: 14, module: 2, bore: 5, bevel: { mate: 40, facegear: "pinion" } }, (src) => meshFace(src, U, V, { teeth: 40 }, 0));
  assert.ok(Math.abs(followersOf(b, b.gears![0]!).followers[0]!.k - 14 / 40) < 1e-9);
  assert.ok(Math.abs(dot(followersOf(b, b.gears![0]!).followers[0]!.dir, axisOf(b, b.gears![1]!)!) - 1) < 1e-9);
});
test("a worm turns about its own length, not the plane's normal, and its wheel turns starts / teeth of it, about its own axis, both ways round", () => {
  const spec: GearSpec = { teeth: 2, module: 2, worm: { diameter: 18, length: 30 } };
  const sc = pair(spec, (src) => meshWith(src, U, V, { teeth: 30 }, Math.PI / 2));
  const [worm, wheel] = sc.gears!;
  const ax = gearAxis(sc, worm!)!;
  assert.deepEqual(ax.dir.map((x) => Math.round(x * 1e9) / 1e9 + 0), [1, 0, 0], "the worm lies along X");
  const f = followersOf(sc, worm!);
  assert.equal(f.why, undefined);
  assert.equal(f.followers.length, 1);
  assert.ok(Math.abs(Math.abs(f.followers[0]!.k) - 2 / 30) < 1e-9, `k ${f.followers[0]!.k}`);
  assert.deepEqual(f.followers[0]!.dir, [0, 0, 1]);
  const back = followersOf(sc, wheel!).followers[0]!;
  assert.ok(Math.abs(back.k * f.followers[0]!.k - 1) < 1e-9, "the wheel turned the worm by the ratio the other way round");
  assert.deepEqual(back.dir.map((x) => Math.round(x * 1e9) / 1e9 + 0), [1, 0, 0]);
  // the wheel on the other side of the worm turns the other way for the same worm
  const other = pair(spec, (src) => meshWith(src, U, V, { teeth: 30 }, -Math.PI / 2));
  assert.ok(followersOf(other, other.gears![0]!).followers[0]!.k * f.followers[0]!.k < 0);
});

test("played from the worm, the wheel is drawn turned and the pose is not kept (a worm has no turn about its own length to write)", async () => {
  const { startMotion, jointMatrix } = await import("../src/interaction/motion.ts");
  const sc = pair({ teeth: 2, module: 2, worm: { diameter: 18, length: 30 } }, (src) => meshWith(src, U, V, { teeth: 30 }, Math.PI / 2));
  const st = startMotion(sc, "b/x_s_90/o" as never);
  assert.ok(st.ok, st.ok ? "" : st.why);
  if (!st.ok) return;
  assert.ok(st.motion.noKeep);
  assert.ok(st.motion.follows.length === 1 && Math.abs(Math.abs(st.motion.follows[0]!.k) - 2 / 30) < 1e-9);
  assert.equal(typeof jointMatrix, "function");
});
