// D flat and keyway bores (`dec_gear_tool`, `in_589`).
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { boreLoop, standardKey, keyDepthOf } from "../src/operation/bore.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const volume = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const extrude = (s: ReturnType<typeof createSession>, face: string, depth: number) => {
  const op = startOp(scene(s), [face as never], "extrude");
  assert.ok(op.ok);
  return runOp(s, { ...(op as { op: Op }).op, value: depth })!.session;
};
const make = (spec: GearSpec) => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  assert.ok(!s.message, s.message ?? "");
  return { s, ...gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }) };
};
const base: GearSpec = { teeth: 24, module: 2 };
const [R, T] = [4, 5];
const circle = Math.PI * R * R;
const cap = (r: number, half: number) => r * r * (half - Math.sin(half) * Math.cos(half));
const dArea = (r: number, h: number) => circle - cap(r, Math.acos((r - h) / r));
const kArea = (r: number, k: number, t2: number) => circle - cap(r, Math.asin(k / 2 / r)) + k * (r + t2 - Math.sqrt(r * r - (k / 2) ** 2));

test("the DIN 6885 table gives a standard key by bore diameter, and none outside it", () => {
  assert.deepEqual([standardKey(10)?.b, standardKey(10)?.t2], [3, 1.4]);
  assert.deepEqual([standardKey(10.01)?.b, standardKey(10.01)?.t2], [4, 1.8]);
  assert.deepEqual([standardKey(8)?.b, standardKey(8)?.t2], [2, 1.0]);
  assert.equal(standardKey(5), null);
  assert.equal(standardKey(40), null);
  assert.equal(keyDepthOf({ ...base, bore: 10, key: 3 }), 1.4);
  assert.equal(keyDepthOf({ ...base, bore: 10, key: 3, keyDepth: 1.6 }), 1.6);
});

test("a D bore is the circle less the cap beyond the flat; a keyway bore is the circle with a slot", () => {
  assert.equal(boreLoop({ ...base, bore: 8 }), null);
  const d = boreLoop({ ...base, bore: 2 * R, flat: 0.5 })!;
  assert.equal(d.points.length, 2);
  assert.ok(Math.abs(d.points[0]![0] - (R - 0.5)) < 1e-12);
  const k = boreLoop({ ...base, bore: 2 * R, key: 2, keyDepth: 1 })!;
  assert.equal(k.points.length, 4);
  assert.ok(Math.abs(k.points[2]![0] - (R + 1)) < 1e-12, "the slot's top is r + t2 from the centre");
});

test("extruded, the D bore and the keyway take exactly their areas out", () => {
  const g = make(base);
  const full = volume(extrude(g.s, loopFaceRef(g.lines), T));
  const d = make({ ...base, bore: 2 * R, flat: 0.8 });
  const dv = volume(extrude(d.s, loopFaceRef(d.lines), T));
  assert.ok(Math.abs(full - dv - dArea(R, 0.8) * T) < 0.002 * full, `${full - dv} against ${dArea(R, 0.8) * T}`);
  const k = make({ ...base, bore: 2 * R, key: 2, keyDepth: 1 });
  const kv = volume(extrude(k.s, loopFaceRef(k.lines), T));
  assert.ok(Math.abs(full - kv - kArea(R, 2, 1) * T) < 0.002 * full, `${full - kv} against ${kArea(R, 2, 1) * T}`);
});

test("a keyway with no typed depth takes the standard's for the bore", () => {
  const std = make({ ...base, bore: 10, key: 3 });
  const typed = make({ ...base, bore: 10, key: 3, keyDepth: 1.4 });
  assert.equal(volume(extrude(std.s, loopFaceRef(std.lines), 5)), volume(extrude(typed.s, loopFaceRef(typed.lines), 5)));
});

test("turning the gear turns the flat with it", () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], turn: Math.PI / 2, spec: { ...base, bore: 8, flat: 1 } });
  const corner = scene(s).parts["d/g_001.bp0" as never] as unknown as { at: number[] };
  assert.ok(Math.abs(corner.at[0]!) > 1.9 && Math.abs(corner.at[1]! - 3) < 1e-9, `${corner.at}`);
});

test("changing a body's bore round, D, keyway, round again follows through the steps", () => {
  const g = make({ ...base, bore: 2 * R });
  let s = extrude(g.s, loopFaceRef(g.lines), T);
  const round = volume(s);
  const spec = (more: Partial<GearSpec>): GearSpec => ({ ...base, bore: 2 * R, ...more });
  s = run(s, { type: "setGear", id: "g_001", spec: spec({ flat: 0.8 }) });
  assert.ok(!s.message, s.message ?? "");
  assert.ok(Math.abs(volume(s) - round - cap(R, Math.acos((R - 0.8) / R)) * T) < 0.002 * round, "D");
  s = run(s, { type: "setGear", id: "g_001", spec: spec({ key: 2, keyDepth: 1 }) });
  assert.ok(!s.message, s.message ?? "");
  assert.ok(volume(s) < round, "a keyway takes more away");
  s = run(s, { type: "setGear", id: "g_001", spec: spec({}) });
  assert.ok(Math.abs(volume(s) - round) < 1e-6 * round, "round again");
});

test("a bore shape that cannot be is refused with the reason", () => {
  const msg = (spec: GearSpec) => { const r = gearOutline(spec); return r.ok ? "" : r.error; };
  assert.match(msg({ ...base, flat: 1 }), /needs a bore/);
  assert.match(msg({ ...base, bore: 8, flat: 1, key: 2 }), /flat or a keyway, not both/);
  assert.match(msg({ ...base, bore: 8, flat: 20 }), /deep into this bore/);
  assert.match(msg({ ...base, bore: 5, key: 2 }), /type the keyway's depth/);
  assert.match(msg({ ...base, bore: 8, key: 2, keyDepth: 30 }), /reach the gear's root/);
  assert.equal(msg({ ...base, bore: 8, key: 2 }), "");
});
