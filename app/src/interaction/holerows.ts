// Rows of holes from the edges a face has (`dec_parts_tool`, `in_958`): the tool does not know flat faces from round ones. A surface gives its outline and a way to turn a point of its own two directions into a place with a way in; the rules
// here make lines from the outline (the edges stepped in, one edge stepped in, one edge stepped in to the middle of the face, or the lines drawn) and each line is repeated like any line (`operation/pathrepeat.ts`), once or in several rows.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Path, Pt, Rules } from "../operation/pathrepeat.ts";
import { placeAlong, lengthOf, pointAt, circlePath, offsetPath } from "../operation/pathrepeat.ts";
import type { FaceSpot } from "../operation/fasteners.ts";

/** Which line the rows follow: the outline stepped in, one edge stepped in, or one edge stepped in to the middle of the face. */
export type RowMode = "outline" | "edge" | "midline";
/** A surface the rows are made on. `outline`: its outline in its own two directions, counter-clockwise (the inside on the left); `map`: the place with its way in at a point of those two directions; `loop`: a surface that turns all the way round (a post's wall) has no edges to the sides, only a lowest and a highest line round it. */
export interface RowSurface {
  outline: Result<Path>;
  map(q: Pt): Result<FaceSpot>;
  loop?: { radius: number; lo: number; hi: number; at(phi: number, a: number): Result<FaceSpot> };
}
export interface RowsMade { /** what the automatic rules chose, in words (`in_979`) */ auto?: string; /** the inset the rows were made with, when it was less than asked for (the face was too small for it, `in_965`) */ insetUsed?: number; places: FaceSpot[]; /** each row as a polyline on the surface, for the guide drawn in the view */ guide: Vec3[][]; /** the spacing of the first row's places, when it has one */ spacing: number | null }
const MAX_HOLES = 200;

/** The longest side of an outline as a path of its own (the first when two are as long); the way it runs is the way the outline runs, so the inside is on its left. */
function longestSide(outline: Path): Path | null {
  let best: Path | null = null;
  let bl = -1;
  for (const s of outline.segs) { const p: Path = { segs: [s], closed: false }; const l = lengthOf(p); if (l > bl + 1e-9) { best = p; bl = l; } }
  return best;
}
/** How far the farthest part of the outline is from the line: the width of the face across it, for the middle. */
function acrossOf(outline: Path, edge: Path): number {
  const e = Array.from({ length: 65 }, (_, i) => pointAt(edge, (lengthOf(edge) * i) / 64).at);
  const total = lengthOf(outline);
  let far = 0;
  const pts: Pt[] = [...outline.segs.flatMap((s) => [s.a, s.b]), ...Array.from({ length: 240 }, (_, i) => pointAt(outline, (total * i) / 240).at)]; // (the corners too, where the farthest point usually is)
  const toSeg = (p: Pt, a: Pt, b: Pt): number => { const [dx, dy] = [b[0] - a[0], b[1] - a[1]]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); };
  for (const p of pts) far = Math.max(far, Math.min(...e.slice(1).map((q, i) => toSeg(p, e[i]!, q))));
  return far;
}
const sample = (path: Path, n: number): Pt[] => { const t = lengthOf(path); return Array.from({ length: n + 1 }, (_, i) => pointAt(path, (t * i) / n).at); };

/** Place along one line (already stepped in by `rules.offset`), mapped onto the surface. */
function alongLine(path: Path, rules: Rules, map: (q: Pt) => Result<FaceSpot>): Result<{ spots: FaceSpot[]; guide: Vec3[]; spacing: number | null }> {
  const placed = placeAlong(path, rules);
  if (!placed.ok) return placed;
  const spots: FaceSpot[] = [];
  for (const f of placed.value.frames) { const s = map(f.at); if (!s.ok) return s; spots.push(s.value); }
  const guide: Vec3[] = [];
  for (const q of sample(placed.value.path, Math.min(400, Math.max(24, Math.ceil(lengthOf(placed.value.path) / 2))))) { const s = map(q); if (s.ok) guide.push(s.value.centre); }
  return ok({ spots, guide, spacing: placed.value.spacing });
}
/** The offsets of each row: the first at `first`, the rest `gap` further in (from the middle, as many on each side, when `centred`). */
const offsets = (first: number, count: number, gap: number, centred: boolean): number[] => Array.from({ length: count }, (_, k) => first + (centred ? k - (count - 1) / 2 : k) * gap);

/** The rows along a line that is given (a line drawn on the surface, in the surface's own two directions): each row stepped in `gap` more than the one before. */
export function rowsAlongLine(path: Path, map: (q: Pt) => Result<FaceSpot>, rules: Rules, count: number, gap: number): Result<RowsMade> {
  const out: RowsMade = { places: [], guide: [], spacing: null };
  for (const [k, off] of offsets(rules.offset ?? 0, count, gap, false).entries()) {
    const r = alongLine(path, { ...rules, offset: off }, map);
    if (!r.ok) return r;
    out.places.push(...r.value.spots); out.guide.push(r.value.guide);
    if (k === 0) out.spacing = r.value.spacing;
  }
  return out.places.length > MAX_HOLES ? err(`that is more than ${MAX_HOLES} holes`) : ok(out);
}
/** The rows the surface's own edges give. `inset` is the first row's distance in from the edge (or from the middle for the middle line: the rows lie either side of it); `rules` places along each line. */
export function rowsFromEdges(surf: RowSurface, mode: RowMode, edge: Path | null, rules: Rules, count: number, gap: number): Result<RowsMade> {
  const asked = rules.offset ?? 0;
  const first = rowsFromEdgesAt(surf, mode, edge, rules, count, gap);
  if (first.ok || mode === "midline" || asked <= 0) return first;
  // the inset is too much for a small face: it goes smaller (half, and half again) instead of failing, down to none
  let inset = asked;
  for (let i = 0; i < 12; i++) {
    inset = i === 11 ? 0 : inset / 2;
    const r = rowsFromEdgesAt(surf, mode, edge, { ...rules, offset: inset }, count, gap);
    if (r.ok) return ok({ ...r.value, insetUsed: Math.round(inset * 100) / 100 });
  }
  return first;
}
function rowsFromEdgesAt(surf: RowSurface, mode: RowMode, edge: Path | null, rules: Rules, count: number, gap: number): Result<RowsMade> {
  const out: RowsMade = { places: [], guide: [], spacing: null };
  const inset = rules.offset ?? 0;
  if (surf.loop) { // (a whole turn round: the lines are the circles at the two ends, stepped in along the axis)
    const { radius, lo, hi, at } = surf.loop;
    if (mode !== "midline" && inset * 2 >= hi - lo - 1e-6) return err("the inset is more than the wall can take"); // (the caller goes smaller)
    const ring = circlePath([0, 0], radius);
    const mapAt = (a: number) => (q: Pt): Result<FaceSpot> => at(Math.atan2(q[1], q[0]), a);
    const rowsAt: number[] = mode === "outline"
      ? [...offsets(inset, count, gap, false).map((o) => hi - o), ...offsets(inset, count, gap, false).map((o) => lo + o)]
      : mode === "edge" ? offsets(inset, count, gap, false).map((o) => lo + o)
      : offsets((hi - lo) / 2, count, gap, true).map((o) => lo + o);
    for (const [k, a] of rowsAt.entries()) {
      const r = alongLine(ring, { ...rules, offset: 0, corners: "ignore" }, mapAt(a));
      if (!r.ok) return r;
      out.places.push(...r.value.spots); out.guide.push(r.value.guide);
      if (k === 0) out.spacing = r.value.spacing;
    }
    return out.places.length > MAX_HOLES ? err(`that is more than ${MAX_HOLES} holes`) : ok(out);
  }
  if (!surf.outline.ok) return surf.outline;
  const outline = surf.outline.value;
  if (mode === "outline") return rowsAlongLine(outline, surf.map, rules, count, gap);
  const side = edge ?? longestSide(outline);
  if (!side) return err("the face has no edge to follow");
  const first = mode === "midline" ? acrossOf(outline, side) / 2 : inset;
  const out2: RowsMade = { places: [], guide: [], spacing: null };
  for (const [k, off] of offsets(first, count, gap, mode === "midline").entries()) {
    const r = alongLine(side, { ...rules, offset: off, corners: "ignore" }, surf.map);
    if (!r.ok) return r;
    out2.places.push(...r.value.spots); out2.guide.push(r.value.guide);
    if (k === 0) out2.spacing = r.value.spacing;
  }
  return out2.places.length > MAX_HOLES ? err(`that is more than ${MAX_HOLES} holes`) : ok(out2);
}

// ---- the automatic choice (`in_979`): a reasonable line, inset and spacing for the face and the hardware ----
const minPair = (spots: readonly FaceSpot[]): number => { let m = Infinity; for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) m = Math.min(m, Math.hypot(spots[i]!.centre[0] - spots[j]!.centre[0], spots[i]!.centre[1] - spots[j]!.centre[1], spots[i]!.centre[2] - spots[j]!.centre[2])); return m; };
/** The most a closed outline can be moved in before it turns inside out or is gone. */
function roomIn(outline: Path): number {
  let lo = 0, hi = 500;
  for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; const o = offsetPath(outline, mid); if (o.ok && lengthOf(o.value) > 1e-3) lo = mid; else hi = mid; }
  return lo;
}
/**
 * Rows that suit the face and the hardware, with nothing asked of the person: the edges stepped in as far as the head of the hardware needs and no more than the face can spare (the head must not break through the edge, and the row
 * must not be a loop with no room), with the spacing made wide enough that no two heads touch (fewer holes when they are too cramped, the asked spacing or number kept when it fits); when the face has no room for a loop, one line along its middle.
 * `headR` is the radius the head, the countersink or the pocket takes at the surface; the inset asked for in `rules` is the one preferred.
 */
export function autoRows(surf: RowSurface, rules: Rules, count: number, gap: number, headR: number): Result<RowsMade> {
  const minInset = headR + 1.5; // (the edge of the head to the edge of the face: a couple of printed perimeters)
  const minSp = 2 * headR + 2; // (the heads' edges 2 mm apart)
  const pref = rules.offset ?? 10;
  const fitSpacing = (mode: RowMode, inset: number, corners: Rules["corners"][]): Result<RowsMade> | null => {
    for (const c of corners) {
      const tries: Rules["spacing"][] = rules.spacing.by === "distance"
        ? [1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3, 4, 6].map((f) => ({ by: "distance" as const, distance: Math.max(rules.spacing.by === "distance" ? rules.spacing.distance : 30, minSp) * f }))
        : Array.from({ length: Math.max(1, (rules.spacing as { count: number }).count) }, (_, k) => ({ by: "count" as const, count: (rules.spacing as { count: number }).count - k }));
      for (const sp of tries) {
        const r = rowsFromEdgesAt(surf, mode, null, { ...rules, offset: inset, corners: c, spacing: sp }, count, gap);
        if (r.ok && r.value.places.length >= 1 && (r.value.places.length === 1 || minPair(r.value.places) >= minSp * 0.999)) return r;
      }
    }
    return null;
  };
  const withNote = (r: Result<RowsMade> | null, note: (n: RowsMade) => string, inset: number): Result<RowsMade> | null => (r && r.ok ? ok({ ...r.value, auto: note(r.value), ...(Math.abs(inset - pref) > 1e-6 ? { insetUsed: Math.round(inset * 100) / 100 } : {}) }) : r);
  const rd = (x: number): string => String(Math.round(x * 10) / 10);
  if (surf.loop) { // a wall all the way round: a loop at each end, or one round the middle
    const room = (surf.loop.hi - surf.loop.lo) / 2 - 0.5;
    if (room >= minInset) {
      const inset = Math.min(Math.max(pref, minInset), room * 0.9);
      const r = withNote(fitSpacing("outline", inset, ["ignore"]), (n) => `a loop at each end, ${rd(inset)} mm in, ${n.places.length / 2} holes each`, inset);
      if (r && r.ok) return r;
    }
    const m = withNote(fitSpacing("midline", 0, ["ignore"]), (n) => `one line round the middle (no room for two): ${n.places.length} holes`, 0);
    return m ?? err("there is no room for the hardware on this face");
  }
  if (!surf.outline.ok) return surf.outline;
  const room = roomIn(surf.outline.value);
  if (room >= minInset + 0.5) {
    const inset = Math.min(Math.max(pref, minInset), room * 0.85);
    const r = withNote(fitSpacing("outline", inset, ["each", "ignore"]), (n) => `edges stepped in ${rd(inset)} mm, ${n.places.length} holes${n.spacing !== null ? `, about ${rd(n.spacing)} mm apart` : ""}`, inset);
    if (r && r.ok && r.value.places.length >= 2) return r;
  }
  const m = withNote(fitSpacing("midline", 0, ["ignore"]), (n) => `one line along the middle: the face has no room for a loop of ${rd(headR * 2)} mm heads (${n.places.length} holes)`, 0);
  return m ?? err("there is no room for the hardware on this face");
}
