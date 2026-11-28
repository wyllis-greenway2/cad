// A closed part of a drawing picked and pointed at, as a face of a body is (`dec_body_look_and_feel`, `in_1716`): a click inside it, where no part of the drawing is, picks it; the pointer over it lays the orb's disc on it; what to draw for it comes from here. The pick is the plane's key and a place
// inside the figure (the engine's own way of finding a region, `interaction/extrude.ts`), so it follows the figure as the drawing changes and is gone when the figure is. Knows nothing of three.js.
import type { SketchParams } from "./engine/sketch.ts";
import { hitAt } from "./interaction/drawing.ts";
import { regionAt, type Region } from "./interaction/extrude.ts";
import { vOf, type Frame } from "./planes.ts";
import type { RegionPick } from "./selection.ts";
import type { Core } from "./sketchcore.ts";
import { to3, type P2 } from "./sketch.ts";
import type { V3 } from "./vec.ts";

/** a figure to be drawn lit: its outline and holes in the plane's axes, and the plane */
export interface LitRegion {
  role: "pick" | "hover";
  frame: { origin: V3; u: V3; v: V3 };
  loops: [number, number][][];
}
export function createRegionSelect(K: Core) {
  const { defs, sel, host, hereAll, solOf } = K;
  let over: RegionPick | null = null,
    pickedAt = 0; // (when a figure was picked, ms: its colour spreads from the click over the time after)
  const found = new WeakMap<SketchParams, Map<string, Region | null>>();
  /** the figure a place of a drawing is inside (null: none), kept for the same drawing and place */
  const regionOf = (p: SketchParams, q: P2): Region | null => {
    let m = found.get(p);
    if (!m) found.set(p, (m = new Map()));
    const k = `${q[0]},${q[1]}`;
    if (!m.has(k)) m.set(k, regionAt(p, q));
    return m.get(k)!;
  };
  const frameOf = (key: string): Frame | null => host.planes().all.get(key) ?? null;
  const same = (a: Region, b: Region): boolean =>
    a.area === b.area &&
    a.loops.length === b.loops.length &&
    a.loops[0]![0]![0] === b.loops[0]![0]![0] &&
    a.loops[0]![0]![1] === b.loops[0]![0]![1];
  return {
    /** The figure a place is inside, with its drawing and plane: what an extrude is made from (null: none). */
    at(key: string, q: P2): { key: string; frame: Frame; def: SketchParams; region: Region } | null {
      const def = defs.get(key),
        frame = frameOf(key),
        region = def && frame ? regionOf(def, q) : null;
      return def && frame && region ? { key, frame, def, region } : null;
    },
    /** A click with no tool that has hit no part of the drawing: the figure it is inside is picked. Returns whether there was one. */
    pick(c: { key: string; p: SketchParams; q: P2; f: Frame; behind: boolean }): boolean {
      if (c.behind || !regionOf(c.p, c.q)) return false;
      sel.setRegion({ key: c.key, at: c.q, click: to3(c.f, c.q) });
      pickedAt = performance.now();
      return true;
    },
    /** The pointer is at (x, y): the figure under it is pointed at, unless a part of the drawing is nearer (those come first). Returns whether one is. */
    hover(x: number, y: number): boolean {
      over = null;
      // the planes with a drawing under the pointer, the nearest first: a part of a drawing comes before a figure; a figure behind a body's surface is not there
      for (const c of hereAll(x, y)) {
        if (c.behind) continue; // (behind a body's surface: not there)
        if (hitAt(c.p, solOf(c.p), c.q, c.tol)) return false;
        if (!regionOf(c.p, c.q)) continue;
        over = { key: c.key, at: c.q, click: to3(c.f, c.q) };
        return true;
      }
      return false;
    },
    leave: (): void => {
      over = null;
    },
    /** What to draw lit: the figure picked and the figure pointed at (not the same one twice), and where the orb stands on them (`orbfill.ts`). A picked figure that is gone is let go. */
    lit(): { lit: LitRegion[]; orb: { hover: V3 | null; spread: { point: V3; since: number } | null } } {
      const out: LitRegion[] = [],
        pk = sel.region();
      let picked: Region | null = null;
      const lit = (role: LitRegion["role"], key: string, r: Region) => {
        const f = frameOf(key);
        if (f)
          out.push({ role, frame: { origin: f.origin, u: f.u, v: vOf(f) }, loops: r.loops as [number, number][][] });
      };
      if (pk) {
        const def = defs.get(pk.key);
        picked = def ? regionOf(def, pk.at) : null;
        if (picked) lit("pick", pk.key, picked);
        else sel.setRegion(null);
      }
      let hovered = false;
      if (over) {
        const def = defs.get(over.key),
          r = def ? regionOf(def, over.at) : null;
        if (r && !(picked && same(picked, r))) {
          lit("hover", over.key, r);
          hovered = true;
        }
      }
      return {
        lit: out,
        orb: {
          hover: hovered ? over!.click : null,
          spread: picked && pk ? { point: pk.click, since: pickedAt } : null,
        },
      };
    },
  };
}
