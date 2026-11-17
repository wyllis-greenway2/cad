// Nesting several parts on a sheet (`in_572`, `in_560`): generic 2D code every cutting route shares. A part is its bounding box here ("bounding-box packing"; the shapes' own outlines are for later), and the parts are packed
// in rows on the sheet, each turned a quarter turn if that fits better and allowed, with a gap between them. Pure; millimetres.
import type { Point2 } from "../contract/index.ts";
import type { Loop, Item } from "./outline.ts";
import { areaOf, containedIn, boxOf } from "./outline.ts";

export interface Rect { id: number; w: number; h: number }
/** Where a part goes: the lower left corner of its box on the sheet, and whether it is turned a quarter turn (then its box is `h` wide and `w` high). */
export interface Placed { id: number; x: number; y: number; rotated: boolean }

/**
 * Pack boxes into rows on a sheet `sheet.w` by `sheet.h`, `gap` mm apart. The tallest first; each goes in the row where it fits with the least width left over, else a new row, else it does not fit. With `rotate` each box
 * is tried both ways. Returns where each went and which did not fit.
 */
export function packRects(rects: readonly Rect[], sheet: { w: number; h: number }, gap: number, rotate: boolean): { placed: Placed[]; unplaced: number[] } {
  const W = sheet.w + gap, H = sheet.h + gap; // (the gap after the last box in a row is not needed: a box and its gap may overhang by a gap)
  const rows: { y: number; h: number; used: number }[] = [];
  const placed: Placed[] = [], unplaced: number[] = [];
  const order = [...rects].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.h - a.h);
  for (const r of order) {
    const options = [{ w: r.w, h: r.h, rotated: false }, ...(rotate && r.w !== r.h ? [{ w: r.h, h: r.w, rotated: true }] : [])];
    let bestRow = -1, bestLeft = Infinity, bestOption = options[0]!;
    for (const o of options) {
      const [w, h] = [o.w + gap, o.h + gap];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        if (h <= row.h + 1e-9 && row.used + w <= W + 1e-9) { const left = W - row.used - w; if (left < bestLeft) { bestRow = i; bestLeft = left; bestOption = o; } }
      }
    }
    if (bestRow >= 0) {
      const row = rows[bestRow]!;
      placed.push({ id: r.id, x: row.used, y: row.y, rotated: bestOption.rotated });
      row.used += bestOption.w + gap;
      continue;
    }
    const top = rows.length ? rows[rows.length - 1]!.y + rows[rows.length - 1]!.h : 0;
    const fits = options.filter((o) => o.w + gap <= W + 1e-9 && top + o.h + gap <= H + 1e-9).sort((a, b) => a.h - b.h)[0]; // (the lower row of the two ways)
    if (!fits) { unplaced.push(r.id); continue; }
    rows.push({ y: top, h: fits.h + gap, used: fits.w + gap });
    placed.push({ id: r.id, x: 0, y: top, rotated: fits.rotated });
  }
  return { placed, unplaced };
}

/** The loops that go together as parts: a closed cut loop that is not inside another is a part with the holes in it (the loops one level in); a loop inside a hole is a part of its own; a score or engrave line or an open line goes with the part it lies in, or is its own part. */
export function groupParts(loops: readonly Loop[], polys: readonly (readonly Point2[])[]): number[][] {
  const closedCut = loops.map((l, i) => (l.layer === "cut" && l.closed ? i : -1)).filter((i) => i >= 0);
  const inside = (i: number, j: number): boolean => i !== j && containedIn(polys[i]!, polys[j]!);
  const depth = new Map(closedCut.map((i) => [i, closedCut.filter((j) => inside(i, j)).length]));
  const area = (i: number): number => Math.abs(areaOf(polys[i]!));
  const smallest = (ids: number[]): number | undefined => ids.sort((a, b) => area(a) - area(b))[0];
  const groups = new Map<number, number[]>();
  for (const i of closedCut) if (depth.get(i)! % 2 === 0) groups.set(i, [i]);
  const rootOf = (i: number): number | undefined => { // the part a loop lies in: the smallest part whose outside edge contains it
    const roots = [...groups.keys()].filter((r) => inside(i, r));
    return smallest(roots);
  };
  const free: number[][] = [];
  loops.forEach((_, i) => {
    if (groups.has(i)) return;
    const r = rootOf(i);
    if (r !== undefined) groups.get(r)!.push(i); else free.push([i]);
  });
  return [...groups.values(), ...free];
}

/** A loop moved: a quarter turn about the origin first (a point `(x, y)` becomes `(-y, x)`), then by `(dx, dy)`. Arcs keep their way round; a quarter turn does not change it. */
export function movedLoop(loop: Loop, rotated: boolean, dx: number, dy: number): Loop {
  const t = (p: Point2): Point2 => (rotated ? [-p[1] + dx, p[0] + dy] : [p[0] + dx, p[1] + dy]);
  const items = loop.items.map((it): Item => (it.kind === "line" ? { ...it, p: t(it.p), q: t(it.q) } : { ...it, center: t(it.center), p: t(it.p), q: t(it.q) }));
  return { ...loop, items };
}

/** The smallest box round a set of polygons, as a width and a height with its lower left corner. */
export function partBox(polys: readonly (readonly Point2[])[]): { x: number; y: number; w: number; h: number } | null {
  const b = boxOf(polys);
  return b ? { x: b.min[0], y: b.min[1], w: b.max[0] - b.min[0], h: b.max[1] - b.min[1] } : null;
}
