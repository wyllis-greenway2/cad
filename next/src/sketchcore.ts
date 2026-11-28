// What every part of the sketching controller shares (`in_1564`, `in_1626`): the sketches by plane (`defs`), what each solves to, the one
// selection, the refusal and the constraints doing work that are shown for a moment (`st`), and the small things the parts all use: the plane under
// the pointer, a pixel in mm, a change kept and said to the history. The drawing tools (`sketchcontrol.ts`), the dragging (`sketchdrag.ts`) and the
// marks (`sketchmarks.ts`) are made over it.
import { forwardDepth, viewHeight, type Cam } from "./camera.ts";
import { segsOf, solveDefinition } from "./engine/definition.ts";
import { pointOnSeg, type Pt } from "./engine/region.ts";
import type { SketchParams } from "./engine/sketch.ts";
import type { Tone } from "./interaction/style.ts";
import type { Flash } from "./interaction/bubbles.ts";
import { emptySketch, tidy, viewSystem, type Sol } from "./interaction/drawing.ts";
import type { Recent } from "./interaction/marks.ts";
import type { NoticeOptions } from "./interaction/notices.ts";
import type { Frame } from "./planes.ts";
import type { Selection } from "./selection.ts";
import { settings } from "./settings.ts";
import { onPlane, to2, to3, type P2 } from "./sketch.ts";
import { vOf } from "./planes.ts";
import { add, scale, type V3 } from "./vec.ts";

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
/** one thing a pointed-at mark draws, in the plane: an arrow (a dashed line and a tip that stops short), a dashed line, a thin line, or a curve (`in_1675`); `plain` is neutral even for an offer's parts (a measure is a number, not a suggestion) */
export type Shape =
  | {
      t: "arrow";
      a: [number, number];
      b: [number, number];
      both?: boolean;
      plain?: boolean;
      tail?: number;
      least?: number;
      pale?: boolean;
    }
  | { t: "line"; a: [number, number]; b: [number, number] }
  | { t: "thin"; a: [number, number]; b: [number, number] }
  | { t: "curve"; pts: [number, number][] };
export interface DrawLine {
  pts: V3[];
  /** a dot's radius, in mm */ r?: number;
  /** a dot's colour (a dot is one kind, `in_1675`) */ tone?: Tone;
  /** a dashed line's dash, in mm (the gap is 0.7 of it) */ dash?: number;
  /** the open tip of an arrow: drawn solid even where its kind is dashed */ head?: boolean;
  /** `pts` are pairs, each two a separate line (a body's edges), not one line through them all */ pairs?: boolean;
  /** hidden by what is in front of it, as a body's edge is (the lines of a drawing are drawn on top of the model) */ hidden?: boolean;
  /** drawn faint (what moves only because the named parts do) */ pale?: boolean;
  kind:
    | "done"
    | "selected"
    | "preview"
    | "cursor"
    | "cut"
    | "tie"
    | "dash"
    | "dashOffer"
    | "dot"
    | "dimExt"
    | "dimArc"
    | "lit"
    | "litOffer"
    | "litOfferSel"
    | "note";
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
    /** the mark being pointed at (its id and what it is offered for): from the marks */
    hover: null as { id: string; over: string } | null,
    /** where the pointed-at bubble stands on the page (px) (`in_1671`) */
    hoverPx: null as { x: number; y: number } | null,
    /** what the pointed-at mark shows on the sketch, as one list of shapes in the plane, with the parts it is about (`in_1675`): set with the marks, drawn with the lines */
    shown: null as { key: string; parts: string[]; offer: boolean; shapes: Shape[] } | null,
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
  /** a click on a part picks it (with Shift: adds it to what is picked, or takes it out if it was already) */
  const pick = (key: string, id: string, shift: boolean): void => {
    const was = selected(key);
    sel.setSketch(key, shift ? (was.includes(id) ? was.filter((q) => q !== id) : [...was, id]) : [id]);
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
  /** the sizes of what is drawn on the sketch are in pixels, turned into mm where they stand (`in_1678`): `n` of `settings.sketch` */
  const px = (f: Frame, q: P2, n: number) => mmPerPx(f, q) * n;
  /** a point as a dot: one kind, its colour by tone and its size a share of the ball's (`in_1675`) */
  const dot = (f: Frame, at: P2, tone: Tone, size = 1): DrawLine => ({
    kind: "dot",
    tone,
    pts: [to3(f, at)],
    r: px(f, at, settings.sketch.ballPx * size),
  });
  /** the cursor's cross at a place (`size`: a share of the usual) */
  const cross = (f: Frame, at: P2, size = 1): DrawLine[] => {
    const arm = px(f, at, settings.sketch.crossPx * size),
      w = to3(f, at);
    return [
      { kind: "cursor", pts: [add(w, scale(f.u, -arm)), add(w, scale(f.u, arm))] },
      { kind: "cursor", pts: [add(w, scale(vOf(f), -arm)), add(w, scale(vOf(f), arm))] },
    ];
  };
  /** what the helpers say of a place, drawn: their ties, dashed guides (dashed at `at`) and dots */
  const helpDrawn = (f: Frame, shown: { kind: DrawLine["kind"]; pts: P2[]; tone?: Tone }[], at: P2): DrawLine[] =>
    shown.map((l) => ({
      kind: l.kind,
      pts: l.pts.map((z) => to3(f, z)),
      ...(l.kind === "dashOffer" ? { dash: dashAt(f, at) } : {}),
      ...(l.kind === "dot" ? { tone: l.tone, r: px(f, l.pts[0]!, settings.sketch.ballPx) } : {}),
    }));
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
    s.kind === "line"
      ? [s.a, s.b]
      : Array.from({ length: settings.sketch.circleSegments + 1 }, (_, k) =>
          pointOnSeg(s, (k / settings.sketch.circleSegments) * s.sweep),
        );

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
    pick,
    dashAt,
    mmPerPx,
    px,
    dot,
    cross,
    helpDrawn,
    here,
    set,
    fail,
    working,
    polyline,
  };
}
export type Core = ReturnType<typeof createCore>;
