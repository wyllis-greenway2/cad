// The shape of the teeth of the bevel family, measured (`in_1015`: the face gear's tooth was wider at its tip than a little under it, and the overlap numbers and the pictures did not say): in every plane across a bevel, spiral or hypoid gear the tooth gets no wider as the radius goes
// up to the tip; in the sections of a crown or a face gear, at every radius the tooth is no wider at a height than at the one below it.
import test from "node:test";
import assert from "node:assert/strict";
import { toothWidths } from "./helpers/toothwidth.ts";
import type { Pt } from "./helpers/toothwidth.ts";
import { spiralPairOf, spiralBody, spiralCrownPairOf } from "../src/operation/spiral.ts";
import { crownOf, crownSection, crownShaft } from "../src/operation/crown.ts";
import { faceFor, faceBody } from "../src/operation/face.ts";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";

const TOL = 1.03; // (3 per cent: the arcs the sections are made of, and the measure's own steps)
/** the widths from the root's end to the tip's, at `n` radii between 25 and 90 per cent of the way up the tooth */
const upTheTooth = (pts: Pt[], bulges: number[], z: number, cap = Infinity): { r: number; w: number }[] => {
  const rs = pts.map((p) => Math.hypot(p[0], p[1]));
  const [lo, hi] = [Math.min(...rs), Math.min(Math.max(...rs), cap)];
  const radii = Array.from({ length: 9 }, (_, i) => lo + (hi - lo) * (0.2 + (0.7 * i) / 8));
  const w = toothWidths(pts, bulges, z, radii);
  return radii.flatMap((r, i) => (w[i] === null ? [] : [{ r, w: w[i]! }]));
};
/** the largest radius of the blank (its section: radius, height) at the height `h`: where the back cones cut the planes across the gear */
const blankRadiusAt = (blank: [number, number][], h: number): number => {
  let r = 0;
  for (let i = 0; i < blank.length; i++) {
    const [a, b] = [blank[i]!, blank[(i + 1) % blank.length]!];
    if ((a[1] - h) * (b[1] - h) <= 0 && a[1] !== b[1]) r = Math.max(r, a[0] + ((h - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  return r;
};
const narrowing = (label: string, rows: { r: number; w: number }[]) => {
  assert.ok(rows.length >= 6, `${label}: only ${rows.length} radii have a tooth`);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i]!.w <= rows[i - 1]!.w * TOL + 0.02, `${label}: the tooth is ${rows[i]!.w.toFixed(2)} mm wide at radius ${rows[i]!.r.toFixed(1)} and ${rows[i - 1]!.w.toFixed(2)} below it (${rows.map((x) => x.w.toFixed(2)).join(" ")})`);
};

for (const [name, z1, z2, mn, beta, off] of [["spiral", 20, 30, 3, 30, 0], ["spiral 40 degrees", 24, 36, 3, 40, 0], ["spiral 17 / 43", 17, 43, 3, 30, 0], ["hypoid", 20, 36, 3, 35, 12], ["hypoid small", 16, 24, 2, 30, 6]] as [string, number, number, number, number, number][]) {
  test(`${name}: in every plane across each gear the tooth gets no wider towards its tip`, () => {
    const p = spiralPairOf(z1, z2, mn, beta, 0.05, 0, off);
    assert.ok(p.ok, p.ok ? "" : p.error);
    if (!p.ok) return;
    for (const which of ["pinion", "ring"] as const) {
      const b = spiralBody(p.value, which);
      assert.ok(b.ok, b.ok ? "" : b.error);
      if (!b.ok) continue;
      const z = which === "pinion" ? z1 : z2;
      let checked = 0;
      b.value.sections.forEach((s, q) => { // (the part of a plane the blank's cones cut away is not part of the tooth: a plane with little left is not measured)
        const rows = upTheTooth(s.points, s.bulges, z, 0.97 * blankRadiusAt(b.value.blank, b.value.big - s.x));
        if (rows.length >= 6) { narrowing(`${name} ${which} plane ${q}`, rows); checked++; }
      });
      assert.ok(checked >= 4, `${name} ${which}: only ${checked} planes measured`);
    }
  });
}
test("a straight bevel gear's outline: the tooth gets no wider towards its tip", () => {
  for (const spec of [{ teeth: 20, module: 3, bevel: { mate: 30 } }, { teeth: 30, module: 3, bevel: { mate: 20 } }] as GearSpec[]) {
    const o = gearOutline(spec);
    assert.ok(o.ok);
    if (o.ok) narrowing(`bevel ${spec.teeth}`, upTheTooth(o.value.points as Pt[], o.value.bulges, spec.teeth));
  }
});
/** at each radius the tooth's width in each section, tip first: no wider than in the section below it */
const noWiderAbove = (label: string, secs: { h: number; points: Pt[]; bulges: number[] }[], z: number, radii: number[]) => {
  const w = secs.map((s) => toothWidths(s.points, s.bulges, z, radii));
  for (let k = 0; k < secs.length - 1; k++) radii.forEach((r, i) => { const [up, below] = [w[k]![i], w[k + 1]![i]]; if (up !== null && up !== undefined && below !== null && below !== undefined) assert.ok(up <= below * TOL + 0.02, `${label}: at radius ${r.toFixed(1)} the tooth is ${up.toFixed(2)} mm wide at height ${secs[k]!.h.toFixed(2)} and ${below.toFixed(2)} at ${secs[k + 1]!.h.toFixed(2)}`); });
  assert.ok(w.every((row) => row.filter((x) => x !== null).length >= 3), `${label}: the tooth is found at three radii or more in every section`);
};
test("a straight crown gear and a spiral crown gear: at every radius the tooth is no wider at the tip than at the root", () => {
  for (const [name, bevel] of [["straight", { mate: 18, shaft: crownShaft(40, 18) }], ["spiral", { mate: 18, shaft: crownShaft(40, 18), spiral: 30 }], ["spiral 45", { mate: 18, shaft: crownShaft(40, 18), spiral: 45 }]] as [string, NonNullable<GearSpec["bevel"]>][]) {
    const spec: GearSpec = { teeth: 40, module: 2, bevel };
    const c = crownOf(spec);
    assert.ok(c.ok, c.ok ? "" : c.error);
    if (!c.ok) continue;
    const secs = [c.value.tip, 0, -c.value.root].map((h) => ({ h, ...crownSection(spec, c.value, h) }));
    noWiderAbove(`crown ${name}`, secs as { h: number; points: Pt[]; bulges: number[] }[], 40, Array.from({ length: 5 }, (_, i) => c.value.inner + 0.5 + ((c.value.outer - c.value.inner - 1) * i) / 4));
  }
});
test("a face gear: at every radius the tooth is no wider at a height than at the one below it", () => {
  for (const [z, pin] of [[40, 14], [36, 16], [48, 20]] as [number, number][]) {
    const f = faceFor({ teeth: z, module: 2, bevel: { mate: pin, facegear: "gear" } } as GearSpec);
    assert.ok(f.ok, f.ok ? "" : f.error);
    if (!f.ok) continue;
    const b = faceBody(f.value.pair);
    assert.ok(b.ok);
    if (!b.ok) continue;
    const pr = f.value.pair;
    noWiderAbove(`face ${z} / ${pin}`, b.value.sections as { h: number; points: Pt[]; bulges: number[] }[], z, Array.from({ length: 5 }, (_, i) => pr.inner + 0.5 + ((pr.outer - pr.inner - 1) * i) / 4));
  }
});
void spiralCrownPairOf;
