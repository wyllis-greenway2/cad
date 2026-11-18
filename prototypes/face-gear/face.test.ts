import test from "node:test";
import { facePair, faceGrid, contourAt, curveAt } from "./face.ts";
test("the face gear's flank curves at several heights", () => {
  const pr = facePair({ z1: 14, z2: 40, m: 2, alpha: (20 * Math.PI) / 180, bl: 0.05, rIn: 40, rOut: 46 });
  const [A, B] = [faceGrid(pr, 1), faceGrid(pr, -1)];
  const radii = [40, 41, 42, 43, 44, 45, 46];
  for (const h of [2, 1, 0, -1, -2, -2.5]) {
    const [ca, cb] = [curveAt(contourAt(pr, A, h), radii), curveAt(contourAt(pr, B, h), radii)];
    const f = (c: number[] | null) => c ? c.map((v) => (v * 40).toFixed(2)).join(" ") : "null";
    console.log("DBG h", h, "A", f(ca), "| B", f(cb));
  }
});
