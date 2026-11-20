// The keyway maker (`dec_keyway_maker`, `in_1267`): a key, a flat or a spline cut into the round hole of a body (the keyed hole) or made on a shaft (the keyed shaft). The gear and the wheel make a round hole; this is what keys it to a
// shaft. Keys: the DIN 6885 widths and hub depths by bore that `bore.ts` holds (a bore outside the table gets a quarter of its diameter and 0.45 of the width); flats: as typed, else 0.15 of the diameter; splines: the straight-sided
// splines of ISO 14, light and medium (`splines.ts`). Pure: numbers in, steps out.
import { Builder, outline, disc, box } from "./modelparts.ts";
import type { Place, ModelBuild, Shape } from "./modelparts.ts";
import { standardKey, keyDepthOf } from "./bore.ts";
import type { GearSpec } from "./gear.ts";
import { splineOutline, nearestSpline, splineName } from "./splines.ts";
import type { SplineRow } from "./splines.ts";
import { bulgeOf, arcMid } from "./arcs.ts";
import type { P } from "./arcs.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

/** The numbers: `kind` 0 key, 1 flat, 2 spline; `bore` the hole's (or the shaft's) diameter; `boreOwned` 1 when the body has a bore of its own (it is its, not typed); `thick` the body's thickness and `bodyR` the radius the hole may reach (the outside, or a gear's roots); `key` the key's width (0: the standard's for the bore), `keyDepth` its depth (0: the standard's, else the usual), `flat` the depth of a D flat (0: 0.15 of the diameter); `series` 0 light, 1 medium; `size` the minor diameter of the spline (0: the one the bore or shaft takes); `len` a shaft's length. */
export interface KeywaySpec { outer: number; kind: number; bore: number; boreOwned: number; thick: number; bodyR: number; key: number; keyDepth: number; flat: number; series: number; size: number; len: number }
export const KEYWAY_START: KeywaySpec = { outer: 40, kind: 0, bore: 10, boreOwned: 0, thick: 10, bodyR: 20, key: 0, keyDepth: 0, flat: 0, series: 1, size: 0, len: 30 };

type Resolved = { kind: 0; r: number; w: number; depth: number } | { kind: 1; r: number; flat: number } | { kind: 2; r: number; row: SplineRow };
const r1 = (v: number): number => Math.round(v * 10) / 10;
/** What the numbers come to once the automatic ones are filled in, or why they make no keyed hole or shaft */
export function keywayResolve(n: KeywaySpec, hole: boolean): Result<Resolved> {
  const k = Math.round(n.kind), d = n.bore;
  if (![0, 1, 2].includes(k)) return err("a keyway is a key (0), a flat (1) or a spline (2)");
  if (![n.key, n.keyDepth, n.flat, n.size].every((v) => v >= 0)) return err("a key, a depth, a flat and a size are 0 or more");
  if (k === 2) {
    const series = Math.round(n.series) === 0 ? "light" : "medium";
    const row = n.size > 0 ? nearestSpline(series, n.size) : nearestSpline(series, d, hole);
    if (hole && d > row.d + 1e-6) return err(`the bore (${r1(d)} mm) is bigger than the spline's minor diameter (${row.d} mm): choose a bigger size`);
    if (hole && row.D / 2 + 0.5 >= n.bodyR) return err(`the spline ${splineName(row)} reaches ${row.D / 2} mm from the middle and the body only ${r1(n.bodyR)} mm: choose a smaller size`);
    return ok({ kind: 2, r: row.d / 2, row });
  }
  if (!(d > 0)) return err(hole ? "a key or a flat needs a bore: give the bore's diameter" : "give the shaft's diameter");
  if (k === 1) {
    const flat = n.flat > 0 ? n.flat : r1(0.15 * d);
    if (!(flat > 0 && flat < 0.9 * d)) return err(`the flat is cut from 0 to ${r1(0.9 * d)} mm deep into this ${hole ? "bore" : "shaft"}`);
    return ok({ kind: 1, r: d / 2, flat });
  }
  const w = n.key > 0 ? n.key : standardKey(d)?.b ?? Math.max(1, r1(0.27 * d));
  if (w >= 0.9 * d) return err("the key is as wide as the " + (hole ? "bore" : "shaft"));
  const spec = { bore: d, key: w, ...(n.keyDepth > 0 ? { keyDepth: n.keyDepth } : {}) } as GearSpec;
  const depth = hole ? keyDepthOf(spec)! : n.keyDepth > 0 ? n.keyDepth : Math.max(0.1, r1(0.55 * w)); // (the shaft's keyway: the DIN 6885 depths for the shaft are not in hand, `dec_keyway_maker`: 0.55 of the key's width until they are)
  if (hole && d / 2 + depth >= n.bodyR * 0.95) return err("the keyway would reach the body's wall: a smaller key, a thinner depth or a bigger body");
  if (!hole && depth >= d / 2 - 0.3) return err("the keyway is deeper than the shaft allows: a thinner depth or a bigger shaft");
  return ok({ kind: 0, r: d / 2, w, depth });
}
export function keywayProblem(n: KeywaySpec, hole: boolean): string | null {
  if (hole && (!(n.thick > 0) || !(n.bodyR > 0))) return "select a round body";
  if (!hole && !(n.len > 0)) return "the length must be more than 0";
  const r = keywayResolve(n, hole);
  return r.ok ? null : r.error;
}
export function keywayAbout(n: KeywaySpec, hole: boolean): string {
  const r = keywayResolve(n, hole);
  if (!r.ok) return r.error;
  const where = hole ? "hole" : "shaft";
  if (r.value.kind === 0) return `a ${r.value.w} mm key, ${r.value.depth} mm deep in the ${where}${n.key > 0 ? "" : " (the standard width for this diameter)"}`;
  if (r.value.kind === 1) return `a D flat ${r.value.flat} mm deep in the ${where}`;
  return `${splineName(r.value.row)} ISO 14 ${r.value.row.series} series spline: ${r.value.row.n} splines ${r.value.row.B} mm wide, ${r.value.row.d} mm minor, ${r.value.row.D} mm outside`;
}

/** the lugs of a spline as slots to cut: each from inside the minor circle (so that none of them shares a surface with the bore that is there) out to the outside circle */
function lugs(row: SplineRow): Shape[] {
  const [rd, rD, b] = [row.d / 2, row.D / 2, row.B / 2], [xd, xD] = [Math.sqrt(rd * rd - b * b) - 0.3, Math.sqrt(rD * rD - b * b)];
  const O: P = [0, 0];
  return Array.from({ length: row.n }, (_, k): Shape => {
    const at = (p: P): P => { const a = (2 * Math.PI * k) / row.n, [c, s] = [Math.cos(a), Math.sin(a)]; return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
    const [p1, p2, p3, p4] = [at([xd, -b]), at([xD, -b]), at([xD, b]), at([xd, b])];
    return outline([p1, p2, p3, p4], [0, bulgeOf(p2, arcMid(O, rD, p2, p3), p3), 0, 0]);
  });
}

/** The keyed hole as the steps of one part: the body's round hole is made if it has none, and the key's slot, the flat's metal or the spline's slots are made in it. The body is as thick as `thick`, its middle on the origin and its axis up. */
export function keyholeSteps(n: KeywaySpec, place: Place): Result<ModelBuild> {
  const bad = keywayProblem(n, true);
  if (bad) return err(bad);
  const res = keywayResolve(n, true);
  if (!res.ok) return res;
  const R = res.value, T = n.thick / 2, depth = n.thick + 2, b = new Builder(place);
  const own = n.boreOwned === 1 ? n.bore / 2 : 0;
  b.part(R.kind === 0 ? "Keyway" : R.kind === 1 ? "Flat" : "Spline");
  const hole = (r: number): void => { b.extrude(b.plane(-T - 1), disc(0, 0, r), [], depth, { mode: "cut" }); };
  if (R.kind === 2) {
    if (own < R.r - 1e-6) hole(R.r); // (the bore is made as wide as the minor circle: there is none, or it is smaller)
    const l = lugs(R.row);
    b.extrude(b.plane(-T - 1), l[0]!, [], depth, { mode: "cut", also: l.slice(1).map((o) => ({ outer: o, depth })) });
  } else {
    if (!own) hole(R.r);
    if (R.kind === 0) {
      const x0 = Math.sqrt(R.r * R.r - (R.w / 2) ** 2) - 0.3;
      b.extrude(b.plane(-T - 1), box(x0, -R.w / 2, R.r + R.depth, R.w / 2), [], depth, { mode: "cut" });
    } else { // (the metal that the flat leaves in the hole: from the flat out past the bore's wall, so that it joins the wall and shares no surface with it)
      const x0 = R.r - R.flat, big = R.r + 0.5, s = Math.sqrt(big * big - x0 * x0), a: P = [x0, -s], c: P = [x0, s];
      b.extrude(b.plane(-T), outline([a, c], [0, bulgeOf(c, [big, 0], a)]), [], n.thick, { mode: "add" });
    }
  }
  return ok(b.build());
}

/** The keyed shaft: a round shaft of the diameter with a keyway or a flat, or a spline shaft, `len` long from the origin up the axis */
export function keyshaftSteps(n: KeywaySpec, place: Place): Result<ModelBuild> {
  const bad = keywayProblem(n, false);
  if (bad) return err(bad);
  const res = keywayResolve(n, false);
  if (!res.ok) return res;
  const R = res.value, b = new Builder(place);
  b.part("Shaft");
  if (R.kind === 2) {
    const o = splineOutline(R.row);
    if (!o) return err("the spline has no outline");
    b.extrude(b.plane(0), outline(o.points, o.bulges), [], n.len);
  } else {
    b.extrude(b.plane(0), disc(0, 0, R.r), [], n.len);
    if (R.kind === 0) b.extrude(b.plane(-1), box(R.r - R.depth, -R.w / 2, R.r + 1, R.w / 2), [], n.len + 2, { mode: "cut" });
    else b.extrude(b.plane(-1), box(R.r - R.flat, -R.r - 1, R.r + 1, R.r + 1), [], n.len + 2, { mode: "cut" });
  }
  return ok(b.build());
}
