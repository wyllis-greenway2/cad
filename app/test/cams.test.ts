import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Plane } from "../src/operation/part.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";
import { camShapes, camProblem } from "../src/operation/cams.ts";
import { drawCam } from "../src/operation/camdraw.ts";

await kernel.init();
const XY = worldRef("XY");
const volume = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const make = (spec: Parameters<typeof drawCam>[3], at: [number, number, number] = [0, 0, 0], turn = 0) => {
  const s = createSession(kernel);
  const pl = scene(s).parts[XY] as Plane;
  const d = drawCam(scene(s), pl, at, spec, turn);
  assert.ok(d.ok, d.ok ? "" : d.error);
  const made = run(s, d.value.command);
  assert.ok(!made.message, made.message ?? "");
  return { s: made, select: d.value.select };
};
const extrude = (s: ReturnType<typeof createSession>, face: string, depth: number) => {
  const op = startOp(scene(s), [face as never], "extrude");
  assert.ok(op.ok, JSON.stringify(op));
  return runOp(s, { ...(op as { op: Op }).op, value: depth })!.session;
};
const T = 6;

test("an eccentric cam is a disc with the shaft off its middle: the volume is the disc less the hole", () => {
  const { s, select } = make({ kind: "eccentric", diameter: 40, lift: 5, hole: 8 });
  assert.equal(select.length, 1);
  const v = volume(extrude(s, select[0]!, T));
  const want = (Math.PI * 20 * 20 - Math.PI * 4 * 4) * T;
  assert.ok(Math.abs(v - want) / want < 0.002, `${v} vs ${want}`);
});

test("a snail cam is the area under its spiral: the volume agrees with the integral, less the hole", () => {
  const spec = { kind: "snail" as const, diameter: 40, lift: 12, hole: 8 };
  const { s, select } = make(spec);
  assert.equal(select.length, 1);
  const v = volume(extrude(s, select[0]!, T));
  const [r0, h] = [20, 12];
  const area = ((2 * Math.PI) / 3) * ((r0 + h) ** 3 - r0 ** 3) / h / 2 - Math.PI * 16; // (integral of r(t)^2 / 2 over one turn, less the hole)
  assert.ok(Math.abs(v - area * T) / (area * T) < 0.01, `${v} vs ${area * T}`);
});

test("a cam turned in its plane and put elsewhere is drawn there (the shaft's hole is where it was clicked)", () => {
  const { s } = make({ kind: "snail", diameter: 30, lift: 8, hole: 6 }, [50, 20, 0], Math.PI / 3);
  const holes = Object.values(scene(s).parts).filter((p) => p.kind === "circle");
  assert.equal(holes.length, 1);
  const c = scene(s).parts[(holes[0] as unknown as { center: string }).center] as unknown as { at: number[] };
  assert.ok(Math.hypot(c.at[0]! - 50, c.at[1]! - 20) < 1e-9);
});

test("a cam that cannot be drawn says why", () => {
  assert.match(camProblem({ kind: "eccentric", diameter: 20, lift: 8, hole: 10 }) ?? "", /break through/);
  assert.match(camProblem({ kind: "snail", diameter: 20, lift: 0, hole: 0 }) ?? "", /lift/);
  assert.equal(camShapes({ kind: "snail", diameter: 20, lift: 5, hole: 0 }).ok, true);
});

// ---- the tool (`in_742`)
import { armCam, typeKey, finish, camSpecOf, previewOf } from "../src/interaction/tools.ts";
import type { Tool } from "../src/interaction/tools.ts";

test("the cam tool: the pointer's distance sets the diameter, typed numbers take over, Tab goes between the three, Enter makes it", () => {
  const s = createSession(kernel);
  let t: Tool = { ...armCam("eccentric"), plane: XY, points: [[0, 0, 0] as [number, number, number]], cursor: [10, 0, 0] as [number, number, number] };
  assert.equal(camSpecOf(t)!.diameter, 20);
  for (const k of ["4", "0", "Tab", "5", "Tab", "8"]) t = typeKey(t, k);
  assert.deepEqual(camSpecOf(t), { kind: "eccentric", diameter: 40, lift: 5, hole: 8 });
  assert.ok(previewOf(scene(s), t)!.segments.length > 90, "the disc and its hole are shown");
  const fin = finish(scene(s), t);
  assert.ok(fin);
  const made = run(s, fin!.command);
  const radii = Object.values(scene(made).parts).filter((p) => p.kind === "circle").map((p) => (p as unknown as { radius: number }).radius).sort((a, b) => a - b);
  assert.deepEqual(radii, [4, 20]);
  // a hole that would break through the edge is not made
  const bad = { ...t, cam: { ...t.cam!, typed: ["20", "8", "10"] } };
  assert.equal(finish(scene(s), bad), null);
});
