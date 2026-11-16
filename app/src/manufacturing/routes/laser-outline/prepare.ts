// Laser outline: from a flat part to the paths a beam follows (`in_569`, `dec_laser_outline_route`). The one place the route's geometry is worked out; `plan` turns it into moves and `check` into findings, so the two never
// disagree. Cut lines get the kerf (outside edges offset out by half of it, holes in by half), tabs, an order that cuts inside before outside, and a start near the head; score and engrave lines are followed on the line, once.
import type { PartSnapshot, Point2, Layer, Settings } from "../../contract/index.ts";
import { loopsOf, polygonOf, depthsOf, boxOf, lengthOf, insidePolygon, containedIn } from "../../core/outline.ts";
import { groupParts } from "../../core/nest.ts";
import { layoutLoops } from "./layout.ts";
import type { Item } from "../../core/outline.ts";
import { offsetPolygon } from "../../core/offset.ts";
import { orderPaths } from "../../core/order.ts";

/** A path to follow: its points, and the exact pieces when it still has them (no kerf, no tabs), so lines and arcs stay lines and arcs. For a closed loop piece `i` starts at point `i`. */
export interface Prepared { points: Point2[]; closed: boolean; depth: number; items?: Item[]; layer: Layer }
export interface Problem {
  kind: "open" | "kerf" | "thin" | "tab" | "noCut" | "noOutside" | "unplaced" | "outside" | "overlap" | "close" | "copies";
  message: string;
  /** where, in the part's own plane coordinates (before the part is moved to the corner) */
  at?: Point2;
}
export interface Prepared2 {
  paths: Record<Layer, Prepared[]>; problems: Problem[];
  /** the drawing's own point that the toolpath calls zero (for the preview's frame): the part's corner when it is moved to the corner, the drawing's zero when not, and when packing the drawing's corner too, so the sheet lies where the drawing is */
  origin: Point2;
  /** what is added to the layout's coordinates to get the toolpath's (the part moved to the corner); a problem's `at` is in the layout's coordinates */
  shift: Point2;
  /** the sheet the parts are laid on: its width and height from the toolpath's zero, or null when not known */
  sheet: { w: number; h: number } | null;
}

const num = (s: Settings, id: string, fallback: number): number => (typeof s[id] === "number" ? (s[id] as number) : fallback);
const dist = (a: Point2, b: Point2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearSeg = (p: Point2, a: Point2, b: Point2): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
};
const turned = (it: Item): Item => (it.kind === "line" ? { ...it, p: it.q, q: it.p } : { ...it, p: it.q, q: it.p, ccw: !it.ccw });
/** The points a path is followed through when it keeps its exact pieces: where each piece starts (and, for an open path, where the last one ends). */
const itemPoints = (items: readonly Item[], closed: boolean): Point2[] => (closed ? items.map((it) => it.p) : [...items.map((it) => it.p), items[items.length - 1]!.q]);
const moveItem = (it: Item, by: Point2): Item => (it.kind === "line" ? { ...it, p: [it.p[0] + by[0], it.p[1] + by[1]], q: [it.q[0] + by[0], it.q[1] + by[1]] } : { ...it, center: [it.center[0] + by[0], it.center[1] + by[1]], p: [it.p[0] + by[0], it.p[1] + by[1]], q: [it.q[0] + by[0], it.q[1] + by[1]] });

/**
 * A closed polygon cut at `tabs` places, each `width` mm wide and evenly round it: the runs that are cut, as open polylines (each from the end of one tab to the start of the next).
 * Null when the tabs would not fit (they and the cuts between them must each have room).
 */
export function runsWithTabs(poly: readonly Point2[], tabs: number, width: number): Point2[][] | null {
  const n = poly.length;
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i]! + dist(poly[i]!, poly[(i + 1) % n]!));
  const total = cum[n]!;
  if (tabs < 1 || width <= 0 || width * tabs * 2 > total) return null;
  const pointAt = (s: number): Point2 => {
    const t = ((s % total) + total) % total;
    let i = 0;
    while (i < n - 1 && cum[i + 1]! < t) i++;
    const len = cum[i + 1]! - cum[i]!;
    const f = len ? (t - cum[i]!) / len : 0;
    const [a, b] = [poly[i]!, poly[(i + 1) % n]!];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const runs: Point2[][] = [];
  for (let k = 0; k < tabs; k++) {
    const s0 = (total * (k + 0.5)) / tabs + width / 2;      // the end of this tab
    const s1 = (total * (k + 1.5)) / tabs - width / 2;      // the start of the next
    const run: Point2[] = [pointAt(s0)];
    for (let lap = 0; lap < 2; lap++) for (let i = 0; i < n; i++) { const sv = cum[i]! + lap * total; if (sv > s0 + 1e-9 && sv < s1 - 1e-9) run.push(poly[i]!); }
    run.push(pointAt(s1));
    runs.push(run);
  }
  return runs;
}

export function prepare(part: PartSnapshot, s: Settings, machineSheet: { w: number; h: number } | null = null): Prepared2 {
  const problems: Problem[] = [];
  const paths: Record<Layer, Prepared[]> = { cut: [], score: [], engrave: [] };
  const loops0 = loopsOf((part.outlines ?? []).flatMap((o) => o.pieces));
  const kerf = num(s, "kerf", 0), tabs = Math.round(num(s, "tabs", 0)), tabWidth = num(s, "tabWidth", 1.5);
  const sheetW = num(s, "sheetWidth", 0) > 0 ? num(s, "sheetWidth", 0) : machineSheet?.w, sheetH = num(s, "sheetHeight", 0) > 0 ? num(s, "sheetHeight", 0) : machineSheet?.h;
  const sheet = sheetW && sheetH ? { w: sheetW, h: sheetH } : null;
  const box0 = boxOf(loops0.map((l) => polygonOf(l)));
  const layout = layoutLoops(loops0, s, sheet); // (nesting on: each part moved to its place on the sheet; off: as drawn, which is the manual layout)
  const loops = layout.loops;
  const polys = loops.map((l) => polygonOf(l));
  const box = boxOf(polys);
  const toCorner = s.toCorner !== false;
  const shift: Point2 = !layout.packed && toCorner && box ? [-box.min[0], -box.min[1]] : [0, 0]; // (a packed layout is already in the sheet's own x and y)
  const origin: Point2 = toCorner && (layout.packed ? box0 : box) ? ((layout.packed ? box0 : box)!.min as Point2) : [0, 0];
  const moved = (p: Point2): Point2 => [p[0] + shift[0], p[1] + shift[1]];
  const cutIdx = loops.map((l, i) => (l.layer === "cut" ? i : -1)).filter((i) => i >= 0);
  const depths = depthsOf(cutIdx.map((i) => polys[i]!), cutIdx.map((i) => loops[i]!.closed));
  if (!cutIdx.length && loops.length) problems.push({ kind: "noCut", message: "Nothing is marked to cut: every line is score or engrave" });
  let outside = 0;

  loops.forEach((loop, i) => {
    const poly = polys[i]!;
    const exactItems = loop.items.map((it) => moveItem(it, shift));
    if (loop.layer !== "cut") { paths[loop.layer].push({ points: itemPoints(exactItems, loop.closed), closed: loop.closed, depth: 0, items: exactItems, layer: loop.layer }); return; }
    const depth = depths[cutIdx.indexOf(i)]!;
    if (!loop.closed) {
      problems.push({ kind: "open", at: poly[poly.length - 1]!, message: "A line to cut does not close, so the piece will not come out: it is cut as drawn" });
      paths.cut.push({ points: itemPoints(exactItems, false), closed: false, depth, items: exactItems, layer: "cut" });
      return;
    }
    const isOutside = depth % 2 === 0;
    if (isOutside) outside++;
    let pts: Point2[] = poly;
    if (kerf > 0) {
      const off = offsetPolygon(poly, isOutside ? kerf / 2 : -kerf / 2);
      if (off) pts = off;
      else problems.push({ kind: "kerf", at: poly[0]!, message: `A feature is too small for a ${kerf} mm kerf: it is cut on its drawn line` });
    }
    if (tabs > 0 && isOutside) {
      const runs = runsWithTabs(pts, tabs, tabWidth);
      if (runs) { for (const r of runs) paths.cut.push({ points: r.map(moved), closed: false, depth, layer: "cut" }); return; }
      problems.push({ kind: "tab", at: pts[0]!, message: `${tabs} tab${tabs === 1 ? "" : "s"} of ${tabWidth} mm do not fit an outline ${lengthOf(pts, true).toFixed(1)} mm long: it is cut with no tabs` });
    }
    const exact = pts === poly; // (no kerf worked on it: lines and arcs stay lines and arcs)
    paths.cut.push(exact ? { points: itemPoints(exactItems, true), closed: true, depth, items: exactItems, layer: "cut" } : { points: pts.map(moved), closed: true, depth, layer: "cut" });
  });
  if (tabs > 0 && cutIdx.length && !outside) problems.push({ kind: "noOutside", message: "Tabs were asked for, and there is no closed outside edge to put them on" });

  // a wall between two cut lines that is thinner than the kerf
  if (kerf > 0 && polys.reduce((n, p) => n + p.length, 0) < 20000) {
    for (const a of cutIdx) for (const b of cutIdx) {
      if (a >= b || !loops[a]!.closed || !loops[b]!.closed) continue;
      let min = Infinity, where: Point2 = polys[a]![0]!;
      for (const p of polys[a]!) for (let j = 0; j < polys[b]!.length; j++) { const d = nearSeg(p, polys[b]![j]!, polys[b]![(j + 1) % polys[b]!.length]!); if (d < min) { min = d; where = p; } }
      if (min > 1e-6 && min < kerf) problems.push({ kind: "thin", at: where, message: `A wall of ${min.toFixed(2)} mm between two cut lines is thinner than the ${kerf} mm kerf` });
    }
  }

  // the layout: parts that did not fit, copies that were not made, parts outside the sheet, parts that overlap or are closer than the gap
  const copiesAsked = Math.round(num(s, "copies", 1));
  if (layout.unplaced) problems.push({ kind: "unplaced", message: `${layout.unplaced} part${layout.unplaced === 1 ? "" : "s"} did not fit on the ${sheet!.w} × ${sheet!.h} mm sheet and ${layout.unplaced === 1 ? "was" : "were"} left out` });
  if (copiesAsked > 1 && !layout.packed) problems.push({ kind: "copies", message: s.nest === "pack" ? "Copies need a sheet size to pack onto: none was made" : "Copies are made only when nesting is on: one of each part is cut" });
  const parts = groupParts(loops, polys).filter((g) => g.some((i) => loops[i]!.layer === "cut" && loops[i]!.closed));
  const outerOf = (g: number[]): number => g.find((i) => loops[i]!.layer === "cut" && loops[i]!.closed && !g.some((j) => j !== i && loops[j]!.layer === "cut" && loops[j]!.closed && containedIn(polys[i]!, polys[j]!)))!;
  if (sheet) {
    for (const g of parts) {
      const b = boxOf(g.map((i) => polys[i]!))!;
      if (b.min[0] + shift[0] < -1e-6 || b.min[1] + shift[1] < -1e-6 || b.max[0] + shift[0] > sheet.w + 1e-6 || b.max[1] + shift[1] > sheet.h + 1e-6) problems.push({ kind: "outside", at: b.min, message: `A part reaches outside the ${sheet.w} × ${sheet.h} mm sheet` });
    }
  }
  const gap = Math.max(0, num(s, "gap", 2));
  if (parts.length > 1 && parts.length <= 60 && polys.reduce((n, p) => n + p.length, 0) < 20000) {
    for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
      const [oa, ob] = [polys[outerOf(parts[a]!)]!, polys[outerOf(parts[b]!)]!];
      const [ba, bb] = [boxOf([oa])!, boxOf([ob])!];
      if (ba.min[0] > bb.max[0] + gap || bb.min[0] > ba.max[0] + gap || ba.min[1] > bb.max[1] + gap || bb.min[1] > ba.max[1] + gap) continue; // (boxes far apart)
      if (oa.some((p) => insidePolygon(p, ob)) || ob.some((p) => insidePolygon(p, oa))) { problems.push({ kind: "overlap", at: oa[0]!, message: "Two parts overlap: both would be cut where they cross" }); continue; }
      let min = Infinity;
      for (const p of oa) for (let j = 0; j < ob.length; j++) min = Math.min(min, nearSeg(p, ob[j]!, ob[(j + 1) % ob.length]!));
      for (const p of ob) for (let j = 0; j < oa.length; j++) min = Math.min(min, nearSeg(p, oa[j]!, oa[(j + 1) % oa.length]!));
      if (min < gap - 1e-6) problems.push({ kind: "close", at: oa[0]!, message: `Two parts are ${min.toFixed(2)} mm apart, closer than the ${gap} mm gap` });
    }
  }

  // inside before outside and the nearest next; a closed loop starts where the head is nearest, an open path from its nearer end
  for (const layer of ["cut", "score", "engrave"] as const) {
    const list = paths[layer];
    paths[layer] = orderPaths(list, [0, 0]).map((v): Prepared => {
      const p = list[v.index]!;
      if (p.closed) return { ...p, points: [...p.points.slice(v.start), ...p.points.slice(0, v.start)], ...(p.items ? { items: [...p.items.slice(v.start), ...p.items.slice(0, v.start)] } : {}) };
      return v.reversed ? { ...p, points: [...p.points].reverse(), ...(p.items ? { items: [...p.items].reverse().map(turned) } : {}) } : p;
    });
  }
  return { paths, problems, origin, shift, sheet };
}
