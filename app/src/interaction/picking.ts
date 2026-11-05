// The one picking function (`dec_clean_engine_design` section 4): what is under the pointer, as an ordered list of candidates.
// Order: corners, then lines (and circles), then faces and planes (a shape before the face under it); inside a class nearest first
// (pixels for points and lines, along the ray for surfaces). Hover is the first candidate; repeated clicks cycle (`selection.click`).
// Drawn, body and world parts are treated alike: nothing here asks where a part came from (`in_088`).
import type { Ref } from "../shared/ref.ts";
import type { Kind, PointerView } from "../operation/part.ts";
import { hitPart, depthOf } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";

export interface Candidate { ref: Ref; kind: Kind; rank: number; /** pixels (points, lines) or distance along the ray (surfaces) */ score: number }
export interface PickOptions {
  /** how close (pixels) a pointer must be to a corner / to a line or circle; the look and input values decide, not this file */
  pointTol: number;
  lineTol: number;
}
export const DEFAULT_PICK: PickOptions = { pointTol: 10, lineTol: 8 };

const RANK: Record<Kind, number> = { corner: 0, line: 1, circle: 1, axis: 1, face: 2, plane: 2, body: 3 };

export function candidatesAt(scene: Scene, pv: PointerView, opts: PickOptions = DEFAULT_PICK): Candidate[] {
  const get = lookup(scene);
  const out: Candidate[] = [];
  for (const p of Object.values(scene.parts)) {
    const rank = RANK[p.kind];
    if (rank <= 1) {
      const d = hitPart(get, p, pv);
      if (d !== null && d <= (rank === 0 ? opts.pointTol : opts.lineTol)) out.push({ ref: p.ref, kind: p.kind, rank, score: d });
    } else if (rank === 2) {
      const t = depthOf(get, p, pv);
      if (t !== null) out.push({ ref: p.ref, kind: p.kind, rank, score: t });
    }
  }
  return out.sort((a, b) => a.rank - b.rank || a.score - b.score || (a.ref < b.ref ? -1 : 1));
}
export const refsAt = (scene: Scene, pv: PointerView, opts?: PickOptions): Ref[] => candidatesAt(scene, pv, opts).map((c) => c.ref);
/** The part to highlight on hover. */
export const hoverAt = (scene: Scene, pv: PointerView, opts?: PickOptions): Ref | undefined => candidatesAt(scene, pv, opts)[0]?.ref;
