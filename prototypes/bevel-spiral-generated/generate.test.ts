// The gearing law code against two checks that need no kernel: (1) a flat flank through the apex generates the spherical involute (the shape `prototypes/bevel-spherical` derived), (2) the numbers of Stadtfeld's worked example (chapter 2,
// Tables 1 to 4) come out of the model: the cutter centre, the blade radii at the blade tips, the centre of roll and the radial distance.
import test from "node:test";
import assert from "node:assert/strict";
import { cutterCentre, flankRadius, workPoint } from "./generate.ts";
import type { CrownSpec, V3 } from "./generate.ts";
import { involuteAzimuth } from "../bevel-spherical/spherical.ts";

const deg = (d: number) => (d * Math.PI) / 180;

test("a flat crown flank through the apex generates the spherical involute", () => {
  for (const [gammaDeg, alphaDeg] of [[20.38, 20], [45, 20], [69.62, 20], [45, 14.5]] as const) {
    const gamma = deg(gammaDeg), alpha = deg(alphaDeg);
    const gb = Math.asin(Math.sin(gamma) * Math.cos(alpha));
    const c: CrownSpec = { RM: 80, RW: 70, beta: 0, tB: 12.57, alpha, gamma };
    const n0: V3 = [Math.cos(alpha), Math.sin(alpha), 0], u: V3 = [-Math.sin(alpha), Math.cos(alpha), 0];
    // points of the plane through the apex that holds the radial line z and is tilted by the pressure angle: P = s z + h u
    const samples: { t: number; f: number }[] = [];
    for (const [s, h] of [[60, -2], [70, -1], [80, 0.5], [90, 2], [100, 3], [85, -3]] as const) {
      const p: V3 = [h * u[0], h * u[1], s];
      const w = workPoint(c, p, n0);
      const [x, y, z] = w.p;
      samples.push({ t: Math.atan2(Math.hypot(x, y), z), f: Math.atan2(y, x) });
    }
    // on the spherical involute the azimuth changes by -+ the involute function of the angle from the axis: f + k phi(t) is the same for all, for k = 1 or -1
    for (const k of [1, -1]) {
      const vals = samples.map((q) => q.f + k * involuteAzimuth(q.t, gb));
      const spread = Math.max(...vals) - Math.min(...vals);
      if (spread < 1e-3) { assert.ok(true); return; }
    }
    assert.fail(`gamma ${gammaDeg}, alpha ${alphaDeg}: no sign makes the azimuth plus the involute function constant: ${samples.map((q) => `(${q.t.toFixed(4)}, ${q.f.toFixed(4)})`).join(" ")}`);
  }
});

test("Stadtfeld's worked example (13 / 35 teeth, 30 degrees, cutter radius 76.2 mm, module 4, 20 degrees): the cutter centre, the blade tip radii, the centre of roll and the radial distance", () => {
  const [z1, z2, D02, b, bm, RW, alpha] = [13, 35, 190, 30, deg(30), 76.2, deg(20)];
  const g1 = Math.atan(z1 / z2), g2 = Math.PI / 2 - g1;
  const RM = D02 / 2 / Math.sin(g2) - b / 2;
  assert.ok(Math.abs(RM - 86.34) < 0.01, `RM ${RM}`);
  const mf = (2 * RM * Math.sin(g2)) / z2;
  assert.ok(Math.abs(mf * Math.cos(bm) - 4.0) < 0.01, "the normal module, 4.00 in the paper (eq. 7)");
  const mn = 4.0, tB = Math.PI * mn; // (the paper rounds the module to 4.00 before the pitch, 12.57: eq. 24)
  assert.ok(Math.abs(tB - 12.57) < 0.01);
  const [hF1, hF2] = [1.2 * mn, 1.2 * mn];
  const ring: CrownSpec = { RM, RW, beta: bm, tB, alpha, gamma: g2, hand: 1 };
  const C = cutterCentre(ring);
  assert.ok(Math.abs(C[0] - 65.99) < 0.01 && Math.abs(C[2] - 48.24) < 0.01, `C ${C}`);
  assert.ok(Math.abs(Math.atan2(C[0], C[2]) * 180 / Math.PI - 53.83) < 0.01 && Math.abs(Math.hypot(C[0], C[2]) - 81.74) < 0.01, "centre of roll and radial distance");
  // the blade tip radii: the pinion's slot at the depth hF1 below the pitch plane (y = -hF1), the ring gear's at hF2 above it
  assert.ok(Math.abs(flankRadius(ring, "A", -hF1) - 74.80) < 0.01, `RCOW1 ${flankRadius(ring, "A", -hF1)}`);
  assert.ok(Math.abs(flankRadius(ring, "B", -hF1) - 77.59) < 0.01, `RCOW2 ${flankRadius(ring, "B", -hF1)}`);
  assert.ok(Math.abs(flankRadius(ring, "B", hF2) - 81.09) < 0.01, `RCOW3 ${flankRadius(ring, "B", hF2)}`);
  assert.ok(Math.abs(flankRadius(ring, "A", hF2) - 71.31) < 0.01, `RCOW4 ${flankRadius(ring, "A", hF2)}`);
  assert.ok(Math.abs(Math.sin(g2) - 0.937404) < 1e-4 && Math.abs(Math.sin(g1) - 0.348245) < 1e-4, "the ratios of roll (the paper rounds the pitch angle to 20.38 degrees)");
});
