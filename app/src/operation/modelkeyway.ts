// The keyway maker (`dec_keyway_maker`, `in_1267`, `in_1289`): a key, a flat or a spline made on the round hole of a body, on a shaft, or on both so that they fit. Four tools share these numbers: the keyed HOLE cut into a round body, the
// keyed SHAFT made on its own, the keyed HUB (a disc with a keyed bore, made from scratch) and the keyed FIT (the same keyway cut into a round shaft that is there). The gear and the wheel make a round hole; this is what keys it to a
// shaft, and Mesh makes the one that fits the other. Keys: the DIN 6885 widths and hub depths by bore that `bore.ts` holds (a bore outside the table gets a quarter of its diameter and 0.45 of the width); flats: as typed, else 0.15 of the
// diameter; splines: the straight-sided splines of ISO 14, light and medium (`splines.ts`). `play` is the room of a fit: a hole is made `play` mm wider than the nominal, a shaft `play` mm narrower. Pure: numbers in, steps out.
import { Builder, outline, disc, box, dirIn, pointIn } from "./modelparts.ts";
import type { Place, ModelBuild, Shape } from "./modelparts.ts";
import { standardKey, keyDepthOf, boreLoop } from "./bore.ts";
import type { GearSpec } from "./gear.ts";
import { splineOutline, nearestSpline, splineName, ISO14 } from "./splines.ts";
import type { SplineRow } from "./splines.ts";
import { bulgeOf, arcMid } from "./arcs.ts";
import type { P } from "./arcs.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

/** The four tools: the hole cut into a body, a shaft of its own, a hub of its own (a disc with a keyed bore), a keyway cut into a shaft that is there */
export type KeywayMode = "hole" | "shaft" | "hub" | "fit";
const isHole = (m: KeywayMode): boolean => m === "hole" || m === "hub";

/**
 * The numbers: `kind` 0 key, 1 flat, 2 spline; `bore` the hole's (or the shaft's) diameter; `boreOwned` 1 when the body has a bore of its own (it is its, not typed); `thick` the body's thickness and `bodyR` the radius a hole may reach
 * (the outside, or a gear's roots); `key` the key's width (0: the standard's for the bore), `keyDepth` its depth (0: the standard's, else the usual), `flat` the depth of a D flat (0: 0.15 of the diameter); `series` 0 light, 1 medium; `size` the
 * minor diameter of the spline (0: the one the bore or shaft takes); `len` a shaft's length and `off` where it starts along the axis; `play` the room of a fit (mm); `outer` a hub's diameter (a body's, for the hole); `part` which part of a shaft is keyed (0 all of it, 1 the end the axis points to, 2 the other end, 3 both ends) and `span` how long that part is (0: one and a half diameters, at most half the shaft).
 */
export interface KeywaySpec { outer: number; kind: number; bore: number; boreOwned: number; thick: number; bodyR: number; key: number; keyDepth: number; flat: number; series: number; size: number; len: number; off: number; play: number; part: number; span: number }
export const KEYWAY_START: KeywaySpec = { outer: 40, kind: 0, bore: 10, boreOwned: 0, thick: 10, bodyR: 20, key: 0, keyDepth: 0, flat: 0, series: 1, size: 0, len: 30, off: 0, play: 0, part: 0, span: 0 };

type Resolved = { kind: 0; r: number; w: number; depth: number } | { kind: 1; r: number; flat: number } | { kind: 2; r: number; row: SplineRow };
const r1 = (v: number): number => Math.round(v * 10) / 10;
/** What the numbers come to once the automatic ones are filled in, or why they make no keyed hole, shaft, hub or fit */
export function keywayResolve(n: KeywaySpec, mode: KeywayMode): Result<Resolved> {
  const k = Math.round(n.kind), d = n.bore, hole = isHole(mode), reach = mode === "hub" ? n.outer / 2 : n.bodyR;
  if (![0, 1, 2].includes(k)) return err("a keyway is a key (0), a flat (1) or a spline (2)");
  if (![n.key, n.keyDepth, n.flat, n.size, n.play].every((v) => v >= 0)) return err("a key, a depth, a flat, a size and a play are 0 or more");
  if (k === 2) {
    const series = Math.round(n.series) === 0 ? "light" : "medium";
    let row: SplineRow;
    if (n.size > 0) row = nearestSpline(series, n.size);
    else if (mode === "fit") { const within = ISO14.filter((r) => r.series === series && r.D <= d + 1e-9); row = within.length ? within[within.length - 1]! : nearestSpline(series, 0); } // (the biggest spline that is no wider than the shaft)
    else row = nearestSpline(series, d, hole);
    if (hole && mode === "hole" && d > row.d + 1e-6) return err(`the bore (${r1(d)} mm) is bigger than the spline's minor diameter (${row.d} mm): choose a bigger size`);
    if (mode === "hub" && d > 0 && d > row.d + 1e-6 && n.size > 0) return err(`the bore (${r1(d)} mm) is bigger than the spline's minor diameter (${row.d} mm): choose a bigger size`);
    if (hole && row.D / 2 + 0.5 >= reach) return err(`the spline ${splineName(row)} reaches ${row.D / 2} mm from the middle and the ${mode === "hub" ? "hub" : "body"} only ${r1(reach)} mm: choose a smaller size`);
    if (mode === "fit" && row.D > d + 0.1) return err(`the shaft (${r1(d)} mm) is smaller than the spline's outside diameter (${row.D} mm): choose a smaller size`);
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
  if (hole && d / 2 + depth >= reach * 0.95) return err("the keyway would reach the body's wall: a smaller key, a thinner depth or a bigger body");
  if (!hole && depth >= d / 2 - 0.3) return err("the keyway is deeper than the shaft allows: a thinner depth or a bigger shaft");
  return ok({ kind: 0, r: d / 2, w, depth });
}
export function keywayProblem(n: KeywaySpec, mode: KeywayMode): string | null {
  if ((mode === "hole" || mode === "fit") && (!(n.thick > 0) || !(n.bodyR > 0))) return "select a round body";
  if (mode === "shaft" && !(n.len > 0)) return "the length must be more than 0";
  if (mode === "hub" && (!(n.thick > 0) || !(n.outer > 0))) return "the hub must have a thickness and a diameter";
  if (mode === "hub" && n.outer / 2 <= Math.max(n.bore, 0) / 2 + 0.5) return "the hub's diameter must be more than the bore's";
  const r = keywayResolve(n, mode);
  return r.ok ? null : r.error;
}
export function keywayAbout(n: KeywaySpec, mode: KeywayMode): string {
  const r = keywayResolve(n, mode);
  if (!r.ok) return r.error;
  const where = isHole(mode) ? "hole" : "shaft", play = n.play > 0 ? `, ${n.play} mm of play` : "";
  if (r.value.kind === 0) return `a ${r.value.w} mm key, ${r.value.depth} mm deep in the ${where}${n.key > 0 ? "" : " (the standard width for this diameter)"}${play}`;
  if (r.value.kind === 1) return `a D flat ${r.value.flat} mm deep in the ${where}${play}`;
  return `${splineName(r.value.row)} ISO 14 ${r.value.row.series} series spline: ${r.value.row.n} splines ${r.value.row.B} mm wide, ${r.value.row.d} mm minor, ${r.value.row.D} mm outside${play}`;
}

/** the keyed length of a shaft from `lo` to `hi` along its axis: the span asked for, else one and a half diameters, never more than half the shaft */
const spanOf = (n: KeywaySpec, lo: number, hi: number): number => Math.min((hi - lo) / 2, n.span > 0 ? n.span : Math.max(5, 1.5 * Math.max(n.bore, 1)));
/** the places along the axis a shaft from `lo` to `hi` is keyed: the whole of it, or a length at its far end, its near end or both; each runs a millimetre past the end it reaches, so that a cut leaves no skin */
function keyedRanges(n: KeywaySpec, lo: number, hi: number): [number, number][] {
  const part = Math.round(n.part), sp = spanOf(n, lo, hi);
  if (part === 1) return [[hi - sp, hi + 1]];
  if (part === 2) return [[lo - 1, lo + sp]];
  if (part === 3) return [[lo - 1, lo + sp], [hi - sp, hi + 1]];
  return [[lo - 1, hi + 1]];
}

/** What a made hole or shaft is, for Mesh (`in_1289`): the shape with its automatic numbers filled in (the key's width and depth, the flat's depth, the spline's series and minor diameter), where it stands and how far it runs along its axis */
export interface KeywayRecord { id: string; role: "hole" | "shaft"; /** the id of the body it is on (`x_<step>`) */ host: string; at: Vec3; dir: Vec3; /** the direction of its x axis (where the first spline or the key stands) */ ex: Vec3; /** the run along the axis from `at` (mm): from, to */ span: [number, number]; nums: { kind: number; bore: number; key: number; keyDepth: number; flat: number; series: number; size: number } }
/** the record of what the numbers make, in the world where it stands (`host` is filled in when the body is known) */
export function keywayMeta(n: KeywaySpec, mode: KeywayMode, place: Place): Omit<KeywayRecord, "id" | "host"> | null {
  const r = keywayResolve(n, mode);
  if (!r.ok) return null;
  const v = r.value, hole = isHole(mode);
  const [lo, hi] = mode === "shaft" ? [n.off, n.off + n.len] : [-n.thick / 2, n.thick / 2], part = Math.round(n.part), sp = spanOf(n, lo, hi);
  const span: [number, number] = (mode === "shaft" || mode === "fit") && part > 0 ? (part === 2 ? [lo, lo + sp] : [hi - sp, hi]) : [lo, hi]; // (a shaft keyed at an end: that end is where its hub goes)
  return {
    role: hole ? "hole" : "shaft", at: pointIn(place, [0, 0, 0]), dir: dirIn(place, [0, 0, 1]), ex: dirIn(place, [1, 0, 0]), span,
    nums: { kind: v.kind, bore: v.kind === 2 ? v.row.d : n.bore, key: v.kind === 0 ? v.w : 0, keyDepth: v.kind === 0 && hole ? v.depth : 0, flat: v.kind === 1 ? v.flat : 0, series: v.kind === 2 ? (v.row.series === "light" ? 0 : 1) : Math.round(n.series), size: v.kind === 2 ? v.row.d : 0 },
  };
}

/** the lugs of a spline as slots to cut: each from inside the minor circle (so that none of them shares a surface with the bore that is there) out to the outside circle */
function lugs(row: { n: number; d: number; D: number; B: number }): Shape[] {
  const [rd, rD, b] = [row.d / 2, row.D / 2, row.B / 2], [xd, xD] = [Math.sqrt(rd * rd - b * b) - 0.3, Math.sqrt(rD * rD - b * b)];
  const O: P = [0, 0];
  return Array.from({ length: row.n }, (_, k): Shape => {
    const at = (p: P): P => { const a = (2 * Math.PI * k) / row.n, [c, s] = [Math.cos(a), Math.sin(a)]; return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
    const [p1, p2, p3, p4] = [at([xd, -b]), at([xD, -b]), at([xD, b]), at([xd, b])];
    return outline([p1, p2, p3, p4], [0, bulgeOf(p2, arcMid(O, rD, p2, p3), p3), 0, 0]);
  });
}
/** a spline row made `by` mm bigger all round (a hole's play) or smaller (a shaft's): the diameters and the width */
const looser = (row: SplineRow, by: number): { n: number; d: number; D: number; B: number } => ({ n: row.n, d: row.d + by, D: row.D + by, B: row.B + by });

/**
 * The keyed hole as the steps of one part: the body's round hole is made if it has none, and the key's slot, the flat's metal or the spline's slots are made in it. The body (or, for a hub, the disc made first) is `thick` thick, its middle on
 * the origin and its axis up. A hole is made `play` mm wider than the nominal.
 */
export function keyholeSteps(n: KeywaySpec, place: Place, mode: "hole" | "hub" = "hole"): Result<ModelBuild> {
  const bad = keywayProblem(n, mode);
  if (bad) return err(bad);
  const res = keywayResolve(n, mode);
  if (!res.ok) return res;
  const R = res.value, T = n.thick / 2, depth = n.thick + 2, b = new Builder(place), p = n.play;
  const own = mode === "hole" && n.boreOwned === 1 ? n.bore / 2 : 0;
  b.part(mode === "hub" ? "Hub" : R.kind === 0 ? "Keyway" : R.kind === 1 ? "Flat" : "Spline");
  if (mode === "hub") { // (the donut: one disc with the keyed hole in it, made whole: a cut would take material from the shaft that stands in the hole)
    let holeShape: Shape;
    if (R.kind === 2) { const o = splineOutline(looser(R.row, p)); if (!o) return err("the spline has no outline"); holeShape = outline(o.points, o.bulges); }
    else {
      const loop = boreLoop(R.kind === 0 ? { bore: 2 * (R.r + p / 2), key: R.w + p, keyDepth: R.depth } as GearSpec : { bore: 2 * (R.r + p / 2), flat: R.flat } as GearSpec);
      holeShape = loop ? outline(loop.points, loop.bulges) : disc(0, 0, R.r + p / 2);
    }
    b.extrude(b.plane(-T), disc(0, 0, n.outer / 2), [holeShape], n.thick);
    return ok(b.build());
  }
  const hole = (r: number): void => { b.extrude(b.plane(-T - 1), disc(0, 0, r), [], depth, { mode: "cut" }); };
  if (R.kind === 2) {
    const row = looser(R.row, p), rd = row.d / 2;
    if (own < rd - 1e-6) hole(rd); // (the bore is made as wide as the minor circle: there is none, or it is smaller)
    const l = lugs(row);
    b.extrude(b.plane(-T - 1), l[0]!, [], depth, { mode: "cut", also: l.slice(1).map((o) => ({ outer: o, depth })) });
  } else {
    const r = R.r + p / 2;
    if (!own) hole(r);
    if (R.kind === 0) {
      const w = R.w + p, x0 = Math.sqrt(r * r - (w / 2) ** 2) - 0.3;
      b.extrude(b.plane(-T - 1), box(x0, -w / 2, r + R.depth, w / 2), [], depth, { mode: "cut" });
    } else { // (the metal that the flat leaves in the hole: from the flat out past the bore's wall, so that it joins the wall and shares no surface with it)
      const x0 = r - R.flat, big = r + 0.5, s = Math.sqrt(big * big - x0 * x0), a: P = [x0, -s], c: P = [x0, s];
      b.extrude(b.plane(-T), outline([a, c], [0, bulgeOf(c, [big, 0], a)]), [], n.thick, { mode: "add" });
    }
  }
  return ok(b.build());
}

/** the cuts that key a round shaft of radius `rs` along the given places: a key's slot, a flat, or, for a spline, the metal outside the profile; `z` is the height of the shaft's axis where the first place is measured from the plane of the model */
function shaftCuts(b: Builder, R: Resolved, n: KeywaySpec, rs: number, ranges: [number, number][]): void {
  const p = n.play;
  for (const [a, c] of ranges) {
    const [pl, depth] = [b.plane(a), c - a];
    if (R.kind === 2) {
      const o = splineOutline(looser(R.row, -p));
      if (o) b.extrude(pl, disc(0, 0, rs + 1), [outline(o.points, o.bulges)], depth, { mode: "cut" }); // (a ring from the spline's profile out beyond the shaft)
    } else if (R.kind === 0) {
      const w = R.w - p;
      b.extrude(pl, box(rs - R.depth, -w / 2, rs + 1, w / 2), [], depth, { mode: "cut" });
    } else b.extrude(pl, box(rs - R.flat, -rs - 1, rs + 1, rs + 1), [], depth, { mode: "cut" });
  }
}

/**
 * The keyed shaft: a round shaft of the diameter with a keyway or a flat, or a spline shaft, `len` long from `off` along the axis, made `play` mm narrower than the nominal. With `part` the keyed part is a length at one end or both (a stub:
 * the shaft is round, as wide as the diameter or the spline, and keyed only there).
 */
export function keyshaftSteps(n: KeywaySpec, place: Place): Result<ModelBuild> {
  const bad = keywayProblem(n, "shaft");
  if (bad) return err(bad);
  const res = keywayResolve(n, "shaft");
  if (!res.ok) return res;
  const R = res.value, b = new Builder(place), p = n.play;
  b.part("Shaft");
  if (Math.round(n.part) > 0) { // (keyed at an end: the round shaft first, wide enough for the spline, then the keyed length cut at its end)
    const rs = (R.kind === 2 ? Math.max(n.bore, R.row.D) : n.bore) / 2 - (R.kind === 2 ? 0 : p / 2);
    b.extrude(b.plane(n.off), disc(0, 0, rs), [], n.len);
    shaftCuts(b, R, n, rs, keyedRanges(n, n.off, n.off + n.len));
    return ok(b.build());
  }
  if (R.kind === 2) {
    const row = looser(R.row, -p), o = splineOutline(row);
    if (!o) return err("the spline has no outline");
    b.extrude(b.plane(n.off), outline(o.points, o.bulges), [], n.len);
  } else {
    const r = R.r - p / 2;
    b.extrude(b.plane(n.off), disc(0, 0, r), [], n.len);
    shaftCuts(b, R, n, r, [[n.off - 1, n.off + n.len + 1]]);
  }
  return ok(b.build());
}

/** The same keyway cut into a round shaft that is there (its middle on the origin, `thick` long, the diameter `bore`), along the whole of it or at an end: the key's slot, the flat, or, for a spline, the metal outside the profile */
export function keyfitSteps(n: KeywaySpec, place: Place): Result<ModelBuild> {
  const bad = keywayProblem(n, "fit");
  if (bad) return err(bad);
  const res = keywayResolve(n, "fit");
  if (!res.ok) return res;
  const R = res.value, b = new Builder(place);
  b.part(R.kind === 0 ? "Keyway" : R.kind === 1 ? "Flat" : "Spline");
  shaftCuts(b, R, n, n.bore / 2, keyedRanges(n, -n.thick / 2, n.thick / 2));
  return ok(b.build());
}
