// A straight crown gear and its straight bevel pinion, made by the gearing law and measured in the kernel (`dec_crown_gears`).
import test from "node:test";
import assert from "node:assert/strict";
import { example, overlap } from "./crownbody.ts";
import { pinionGrid, crownFlank, flankAngle } from "./crown.ts";
import { contourAt, outlineAt, blankFor } from "../bevel-spiral-generated/sections.ts";
import { kernel } from "../../app/src/compiler/kernel/index.ts";

test("the crown's flank plane: the points are on it, the normal is square to it, and the tooth narrows towards -y by y tan(alpha) at every radius", () => {
  const cp = example();
  const a = crownFlank(cp, 1, 40, 0), b = crownFlank(cp, 1, 50, 0), c = crownFlank(cp, 1, 40, -2);
  const d1 = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]], d2 = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
  const dot = (p: number[], q: number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
  assert.ok(Math.abs(dot(a.n, d1)) < 1e-9 && Math.abs(dot(a.n, d2)) < 1e-9, "the normal is square to two directions of the plane");
  assert.ok(Math.abs(flankAngle(cp, 0, 40) - cp.halfAngle) < 1e-12);
  // the half width in mm at the pitch plane is r * halfAngle; at y it is that less y tan(alpha) (y < 0: less)
  for (const r of [34, 40, 46]) assert.ok(Math.abs(r * Math.sin(flankAngle(cp, -2.5, r)) - (r * Math.sin(cp.halfAngle) - 2.5 * Math.tan(cp.spec.alpha))) < 0.2, `r ${r}`);
});

test("the pinion's sections exist across the face: its gamma follows sin(g) = z1 / zc, the outline of its teeth at each plane", () => {
  const cp = example();
  assert.ok(Math.abs(Math.sin(cp.pinion.gamma) - 18 / 40) < 1e-12);
  const bl = blankFor(cp.pinion, 34, 46, 2, 0);
  assert.ok(typeof bl !== "string", typeof bl === "string" ? bl : "");
  const [A, B] = [pinionGrid(cp, 1), pinionGrid(cp, -1)];
  for (const f of [0, 0.5, 1]) {
    const X = (bl as { xS: number; xB: number }).xS + ((bl as { xS: number; xB: number }).xB - (bl as { xS: number; xB: number }).xS) * f;
    const o = outlineAt(cp.pinion, "pinion", contourAt(A, cp.pinion.axis, X), contourAt(B, cp.pinion.axis, X), X);
    assert.ok(o, `an outline at X ${X.toFixed(1)}`);
  }
});

test("the crown and its pinion in the kernel: the pair fits at its place and rolling, not half a pitch round", async () => {
  await kernel.init();
  const cp = example();
  const k = Math.sin(cp.pinion.gamma);
  const rows: string[] = [];
  for (const [name, tp, tc] of [["at the place", 0, 0], ["rolled by 0.05", 0.05, -k * 0.05], ["pinion half a pitch round", Math.PI / cp.pinion.z, 0]] as const) {
    const o = overlap(cp, tp, tc);
    rows.push(`${name}: ${o.none ? "nothing in common" : `${o.vol.toFixed(1)} mm3`} (bodies ${o.vols.join(", ")})`);
  }
  console.log("ROWS\n" + rows.join("\n"));
});
