// Laser outline: laying the parts on the sheet (`in_572`, `in_560`). With nesting on, the parts of the drawing (and copies of them) are packed in rows on the sheet as boxes, turned a quarter turn when that fits better;
// with it off they are where they were drawn, which is the manual layout (the person moves them with the tools they have, and the sheet edge and the spacing are shown and checked).
import type { Point2, Settings } from "../../contract/index.ts";
import type { Loop } from "../../core/outline.ts";
import { polygonOf } from "../../core/outline.ts";
import { groupParts, packRects, movedLoop, partBox } from "../../core/nest.ts";

export interface Layout { loops: Loop[]; packed: boolean; /** parts that did not fit on the sheet and were left out */ unplaced: number }
const num = (s: Settings, id: string, d: number): number => (typeof s[id] === "number" ? (s[id] as number) : d);

/** The loops as the sheet has them. Not packing: as they are. Packing: each part (and each copy) moved to its place; a part that does not fit is left out and counted. */
export function layoutLoops(loops: readonly Loop[], s: Settings, sheet: { w: number; h: number } | null): Layout {
  if (s.nest !== "pack" || !sheet || !loops.length) return { loops: [...loops], packed: false, unplaced: 0 };
  const polys = loops.map((l) => polygonOf(l));
  const groups = groupParts(loops, polys);
  const copies = Math.max(1, Math.round(num(s, "copies", 1)));
  const margin = Math.max(0, num(s, "margin", 0)), gap = Math.max(0, num(s, "gap", 2));
  const parts = Array.from({ length: copies }, () => groups).flat().map((g) => ({ loops: g.map((i) => loops[i]!), box: partBox(g.map((i) => polys[i]!))! }));
  const { placed, unplaced } = packRects(parts.map((p, id) => ({ id, w: p.box.w, h: p.box.h })), { w: sheet.w - 2 * margin, h: sheet.h - 2 * margin }, gap, s.rotate !== false);
  const out: Loop[] = [];
  for (const pl of placed) {
    const { box, loops: ls } = parts[pl.id]!;
    const min: Point2 = pl.rotated ? [-(box.y + box.h), box.x] : [box.x, box.y]; // (where the box's lower left corner is after the quarter turn)
    const [dx, dy] = [margin + pl.x - min[0], margin + pl.y - min[1]];
    for (const l of ls) out.push(movedLoop(l, pl.rotated, dx, dy));
  }
  return { loops: out, packed: true, unplaced: unplaced.length };
}
