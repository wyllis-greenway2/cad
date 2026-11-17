// Why a swept body has creases though its path is smooth (`in_655`): a profile that is not square to the path is carried rigidly, so the sides turn by (the change of curvature) x (how far a corner stands off the path along it) where the path's
// curvature jumps (the joint of two arcs). The kernel says so when it is about two degrees or more.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession } from "../src/interaction/session.ts";

await kernel.init();
type R = { ops: { id: string; error: string | null; note?: string }[]; volume: number };
const bend = [{ a: [23.8, 15.27, 0], m: [23.8, 14.806, 16.435], b: [23.8, 21.25, 31.56] }, { a: [23.8, 21.25, 31.56], m: [23.8, 24.156, 40.66], b: [23.8, 21.25, 49.76] }];
const t0 = [0, -0.241, 0.9705]; // the tangent at the start of the bend
const unit = (v: number[]) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const sweep = (path: unknown[], square: boolean) => {
  const profile = square
    ? { id: "s_a", type: "sketch", shape: "polygon", points: [[-6, -7], [9, -7], [9, 7], [-6, 7]], plane: "XY", origin: 0, frame: { origin: [23.8, 15.27, 0], xDir: [1, 0, 0], normal: unit(t0) } }
    : { id: "s_a", type: "sketch", shape: "polygon", points: [[16.71, 9.62], [32.26, 9.62], [32.26, 23.46], [16.71, 23.46]], plane: "XY", origin: 0 };
  return kernel.evaluate({ params: {}, ops: [profile, { id: "x_w", type: "sweep", profile: "s_a", path }] } as never) as unknown as R;
};
const note = (r: R) => r.ops.find((o) => o.id === "x_w")!.note;

test("a profile 14 degrees off square carried round an S bend: the kernel says the sides crease by about 10 degrees at the joint of the arcs", () => {
  const r = sweep(bend, false);
  assert.equal(r.ops.find((o) => o.id === "x_w")!.error, null);
  assert.match(note(r) ?? "", /^the shape is 14° off square to the path, so the sides crease by about (9|10|11)° where the path's curvature changes/);
});

test("the same bend with the profile square to the path, one arc alone, and a straight path: no crease, nothing said", () => {
  assert.equal(note(sweep(bend, true)), undefined, "square profile");
  assert.equal(note(sweep([bend[0]!], false)), undefined, "one arc: its curvature does not change");
  assert.equal(note(sweep([{ a: [23.8, 15.27, 0], b: [23.8, 15.27, 40] }], false)), undefined, "a straight path");
});

test("the human's swept body says it", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/sweep-chamfer-in_653.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  assert.match(r.value.outcome.notes?.["s_027"] ?? "", /off square to the path, so the sides crease by about/);
});
