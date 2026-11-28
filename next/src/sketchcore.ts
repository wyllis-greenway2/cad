// What every part of the sketching controller shares (`in_1564`, `in_1626`): the sketches by plane (`defs`), what each solves to, the one
// selection, the refusal and the constraints doing work that are shown for a moment (`st`), and the small things the parts all use: the plane under
// the pointer, a pixel in mm, a change kept and said to the history. The drawing tools (`sketchcontrol.ts`), the dragging (`sketchdrag.ts`) and the
// marks (`sketchmarks.ts`) are made over it.
import { forwardDepth, viewHeight, type Cam } from "./camera.ts";
import { segsOf, solveDefinition } from "./engine/definition.ts";
import { pointOnSeg, type Pt } from "./engine/region.ts";
import type { SketchParams } from "./engine/sketch.ts";
import type { DimLine, Flash } from "./interaction/bubbles.ts";
import { emptySketch, tidy, viewSystem, type Sol } from "./interaction/drawing.ts";
import type { Recent } from "./interaction/marks.ts";
import type { NoticeOptions } from "./interaction/notices.ts";
import type { Frame } from "./planes.ts";
import type { Selection } from "./selection.ts";
import { settings } from "./settings.ts";
import { onPlane, to2, to3, type P2 } from "./sketch.ts";
import type { V3 } from "./vec.ts";

export interface SketchHost {
  view(): { cam: Cam; w: number; h: number };
  /** Every plane there is, by name (the sketches of a plane that is gone are let go), and the one that is on. */
  planes(): { all: Map<string, Frame>; on: string; step: number };
  ray(x: number, y: number): { o: V3; d: V3 };
  /** digits typed with a part selected go to its number in the info bar (false: there is none), and whether a number is being typed */
  startEdit(id: string, initial: string): boolean;
  editing(): boolean;
  /** a sentence for the person, through the page's one notice (`interaction/notices.ts`) */
  notify(text: string, o?: NoticeOptions): void;
  /** the page's one selection (`selection.ts`): what is selected in a sketch is kept there, so selecting on a body puts it away */
  selection: Selection;
}
export interface DrawLine {
  pts: V3[];
  /** a ball's radius, in mm */ r?: number;
  /** a dashed line's dash, in mm (the gap is 0.7 of it) */ dash?: number;
  kind:
    | "done"
    | "selected"
    | "preview"
    | "cursor"
    | "cut"
    | "tie"
    | "tieBall"
    | "guide"
    | "ball"
    | "centre"
    | "dim"
    | "dimExt"
    | "dimHead"
    | "lit"
    | "litOffer"
    | "litOfferSel"
    | "note"
    | "move"
    | "moveHead";
}

export function createCore(host: SketchHost, on?: (label: string, merge?: string) => void) {
  const defs = new Map<string, SketchParams>(),
    sols = new WeakMap<SketchParams, Sol>(),
    fillCache = new WeakMap<SketchParams, [number, number][][][]>();
  const sel = host.selection;
  /** what is shown for a moment: the refusal and the constraints doing work (until when), the parts just made whose offers show for a while even when nothing is selected (`dec_marks_on_things`), and when each constraint doing work began (for its fade) */
  const st = {
    flash: {} as Flash,
    flashUntil: 0,
    recent: null as (Recent & { key: string }) | null,
    activeSince: new Map<string, number>(),
    /** what the offers showing now would move, from where to where (set with the marks, drawn with the lines) */
    /** the mark being pointed at (its id and what it is offered for), and the parts it is about with whether it is an offer: both from the marks, drawn with the lines */
    hover: null as { id: string; over: string } | null,
    lit: null as { key: string; parts: string[]; offer: boolean; dim: DimLine | null } | null,
    moves: null as { key: string; list: { from: [number, number]; to: [number, number] }[] } | null,
  };
  const say = (text: string, ms = 4000) => host.notify(text, { ttl: ms });
  const systems = new WeakMap<SketchParams, ReturnType<typeof viewSystem>>(),
    sysOf = (p: SketchParams) => {
      let y = systems.get(p);
      if (!y) {
        y = viewSystem(p, solOf(p));
        systems.set(p, y);
      }
      return y;
    }; // (a definition has one system: asked for by every part of a frame)
  const solOf = (p: SketchParams): Sol => {
    let s = sols.get(p);
    if (!s) {
      const r = solveDefinition(p);
      s = { points: r.points, radii: r.radii };
      sols.set(p, s);
    }
    return s;
  };
  const current = () => {
    const { all, on } = host.planes();
    const f = all.get(on);
    return f ? { key: on, f, p: defs.get(on) ?? emptySketch() } : null;
  };
  /** what is selected in the sketch of a plane, as far as it is still there (a part taken away, by a deletion or an undo, is not selected any more) */
  const selected = (key: string): string[] => {
    const p = defs.get(key),
      ids = [...sel.sketch(key)];
    if (!p) return ids;
    const has = new Set([...p.points, ...(p.lines ?? []), ...(p.circles ?? []), ...(p.arcs ?? [])].map((x) => x.id));
    return ids.filter((id) => has.has(id));
  };
  /** the dash of a guide, as the old app's (`settings.helpers.dash` of the view's distance; worked from the view's height over twice the tangent of half its angle, so it is the same in the straight view) */
  const dashAt = (f: Frame, q: P2) => {
    const { cam } = host.view();
    return (
      (viewHeight(cam, Math.max(forwardDepth(cam, to3(f, q)), 1e-3)) * settings.helpers.dash) /
      (2 * Math.tan((settings.view.fovDeg * Math.PI) / 360))
    );
  };
  const mmPerPx = (f: Frame, q: P2) => {
    const { cam, h } = host.view();
    return viewHeight(cam, Math.max(forwardDepth(cam, to3(f, q)), 1e-3)) / h;
  };
  const here = (x: number, y: number) => {
    const c = current();
    if (!c) return null;
    const r = host.ray(x, y),
      q = onPlane(c.f, r.o, r.d);
    if (!q) return null;
    const mm = mmPerPx(c.f, to2(c.f, q));
    return { ...c, q: to2(c.f, q), mm, tol: mm * settings.sketch.snapPx };
  };
  /** a change of a sketch: kept, and said to whoever keeps the history (`label`: what it was; `merge`: changes with the same key are one, a number typed again and again) */
  const set = (key: string, p: SketchParams, label: string, merge?: string) => {
    defs.set(key, tidy(p));
    on?.(label, merge);
  }; // (a change leaves nothing behind: `tidy`)
  const fail = (why: string, victims: string[]) => {
    host.notify(why, { kind: "warn", ttl: 4000 });
    st.flash = { refused: victims };
    st.flashUntil = performance.now() + 1800;
  };

  /** what a drag in progress shows of the constraints: the ones doing work fade in (green), the ones that hold the drag back flash (red) */
  const working = (active: string[], held: string[]) => {
    const now = performance.now();
    for (const id of active) if (!st.activeSince.has(id)) st.activeSince.set(id, now);
    st.flash = { ...(held.length ? { refused: held } : {}), ...(active.length ? { applied: active } : {}) };
    st.flashUntil = now + 400;
    if (held.length) say("Held back by the constraints shown in red", 600);
  };
  const polyline = (s: ReturnType<typeof segsOf>[number]): Pt[] =>
    s.kind === "line" ? [s.a, s.b] : Array.from({ length: 65 }, (_, k) => pointOnSeg(s, (k / 64) * s.sweep));

  return {
    host,
    defs,
    fillCache,
    sel,
    st,
    say,
    sysOf,
    solOf,
    current,
    selected,
    dashAt,
    mmPerPx,
    here,
    set,
    fail,
    working,
    polyline,
  };
}
export type Core = ReturnType<typeof createCore>;
