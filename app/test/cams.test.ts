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

// ---- the tool (`in_694`)
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

// ---- the disc cam (`in_696`)
import { splinePoints } from "../src/operation/spline.ts";
import { loopPoints } from "../src/operation/part.ts";

const disc = (over: Partial<Parameters<typeof drawCam>[3]> = {}) => ({ kind: "disc" as const, law: "cycloidal" as const, diameter: 40, lift: 10, rise: 120, dwell: 40, ret: 100, hole: 8, roller: 0, ...over });
const radiusAt = (s: ReturnType<typeof createSession>, deg: number): number => {
  // the cam's drawn outline, where a ray from the shaft crosses it
  const face = Object.values(scene(s).parts).find((p) => p.kind === "face") as unknown as { loop: string[]; corners: string[] };
  const poly = loopPoints((r) => scene(s).parts[r], face.loop as never, face.corners as never);
  const t = (deg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(t), Math.sin(t)];
  let best = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const [ex, ey] = [q[0] - p[0], q[1] - p[1]];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return;
    const [u, v] = [(p[0] * ey - p[1] * ex) / den, (p[0] * dy - p[1] * dx) / den]; // (the ray at u along, the edge at v of the way)
    if (u > 0 && v >= 0 && v <= 1) best = Math.max(best, u);
  });
  return best;
};

test("a disc cam rises by its lift over the rise, stays up over the dwell, comes down over the return, and rests", () => {
  const { s } = make(disc());
  const near1 = (a: number, b: number, tol = 0.08) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
  near1(radiusAt(s, 0), 20); // (the start of the rise: the base circle)
  near1(radiusAt(s, 60), 25, 0.15); // (half way through a cycloidal rise: half the lift)
  near1(radiusAt(s, 120), 30); near1(radiusAt(s, 150), 30); // (the top, and the dwell)
  near1(radiusAt(s, 210), 25, 0.2); // (half way down: 160 + 50 of the 100 degrees of the return)
  near1(radiusAt(s, 300), 20); near1(radiusAt(s, 330), 20); // (the rest at the bottom)
});

test("the laws differ where they should: a quarter of the way through the rise the harmonic cam is highest, the parabolic next, the cycloidal lowest (it starts most gently)", () => {
  const at30 = (law: "cycloidal" | "harmonic" | "parabolic") => radiusAt(make(disc({ law })).s, 30);
  const [h, p, c] = [at30("harmonic"), at30("parabolic"), at30("cycloidal")];
  assert.ok(h > p + 0.1 && p > c + 0.1, `${h} ${p} ${c}`); // (the lift 10 mm: 1.46, 1.25 and 0.91 above the base circle at a quarter of the rise)
});

test("the knots follow the true outline to a hundredth of a millimetre, with few enough to edit", () => {
  const spec = disc();
  const shapes = camShapes(spec);
  assert.ok(shapes.ok && shapes.value.closed);
  const ring = shapes.value.closed!;
  assert.ok(ring.length >= 8 && ring.length <= 80, `${ring.length} knots`);
  const pts = ring.map((q) => [q[0], q[1], 0] as [number, number, number]);
  const n = pts.length;
  const curve = splinePoints([...pts, pts[0]!], 16, { before: pts[n - 1]!, after: pts[1]! });
  // each point of the curve is a hair from a point of the true outline (a dense sample of it)
  const true_ = camShapes({ ...spec }).ok ? Array.from({ length: 1440 }, (_, i) => { const t = (i / 1440) * 2 * Math.PI; const q = camTrue(spec, t); return q; }) : [];
  const off = (c: readonly number[]): number => Math.min(...true_.map((q, i) => { const w = true_[(i + 1) % true_.length]!; const [ex, ey] = [w[0] - q[0], w[1] - q[1]]; const k = Math.max(0, Math.min(1, ((c[0]! - q[0]) * ex + (c[1]! - q[1]) * ey) / (ex * ex + ey * ey || 1))); return Math.hypot(q[0] + ex * k - c[0]!, q[1] + ey * k - c[1]!); }));
  let worst = 0;
  for (const c of curve) worst = Math.max(worst, off(c));
  assert.ok(worst < 0.05, `worst ${worst}`);
});
function camTrue(spec: ReturnType<typeof disc>, t: number): [number, number] {
  // the pitch curve of a cycloidal disc cam by its own law (no roller)
  const d = Math.PI / 180;
  const a = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const f = (u: number) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);
  const h = a < spec.rise * d ? f(a / (spec.rise * d)) : a < (spec.rise + spec.dwell) * d ? 1 : a < (spec.rise + spec.dwell + spec.ret) * d ? 1 - f((a - (spec.rise + spec.dwell) * d) / (spec.ret * d)) : 0;
  const r = 20 + spec.lift * h;
  return [r * Math.cos(t), r * Math.sin(t)];
}

test("a roller takes the profile in by its radius; one too big for a tight turn is refused", () => {
  const plain = camShapes(disc());
  const rolled = camShapes(disc({ roller: 3 }));
  assert.ok(plain.ok && rolled.ok);
  // at the top dwell (a round part of the pitch curve) the profile is 3 mm nearer the shaft
  const top = (r: typeof plain) => Math.max(...r.value!.closed!.map((q) => Math.hypot(q[0], q[1])));
  assert.ok(Math.abs(top(plain as never) - top(rolled as never) - 3) < 0.05, `${top(plain as never)} ${top(rolled as never)}`);
  const huge = camShapes(disc({ roller: 60 }));
  assert.equal(huge.ok, false);
  assert.match(huge.ok ? "" : huge.error, /roller/);
});

test("angles that add up to more than a turn are refused with the sum", () => {
  const bad = camShapes(disc({ rise: 200, dwell: 100, ret: 100 }));
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.error, /400/);
});

test("a disc cam extrudes to a body of about the area of its outline less the hole", () => {
  const { s, select } = make(disc());
  const face = scene(s).parts[select[0] as never] as unknown as { loop: string[]; corners: string[] };
  const poly = loopPoints((r) => scene(s).parts[r], face.loop as never, face.corners as never);
  let area = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]!; area += p[0] * q[1] - q[0] * p[1]; });
  area = Math.abs(area) / 2 - Math.PI * 16;
  const v = volume(extrude(s, select[0]!, T));
  assert.ok(Math.abs(v - area * T) / (area * T) < 0.01, `${v} vs ${area * T}`);
});

// ---- the cam box (`in_696`): a panel with every number named and explained; its lengths follow the number system, its angles do not
import { entryOf, inUnits } from "../src/interaction/entry.ts";
import { CAM_HINTS } from "../src/interaction/gearhelp.ts";
import { CAM_FIELDS } from "../src/interaction/tools.ts";
import { units } from "../src/shared/units.ts";

test("every number of every cam has a hint, and the box is a panel", () => {
  for (const kind of ["eccentric", "snail", "disc"] as const) for (const label of CAM_FIELDS[kind]) assert.ok((CAM_HINTS[label] ?? "").length > 10, `${kind}: ${label}`);
  const s = createSession(kernel);
  const t: Tool = { ...armCam("disc", "harmonic"), plane: XY, points: [[0, 0, 0]], cursor: [20, 0, 0] };
  const e = entryOf(scene(s), t, null);
  assert.ok(e && e.panel === "Disc cam, harmonic");
  assert.deepEqual(e!.fields.map((f) => f.label), CAM_FIELDS.disc);
  assert.deepEqual(e!.fields.filter((f) => f.unit === "°").map((f) => f.label), ["Rise", "Dwell", "Return"]);
  units.system = "in";
  try {
    const shown = inUnits(e)!;
    assert.equal(shown.fields[0]!.value, "1.5748"); // (a 40 mm base circle)
    assert.equal(shown.fields[2]!.value, "120"); // (degrees stay degrees)
  } finally { units.system = "mm"; }
});
