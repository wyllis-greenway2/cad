// The sketching controller (`in_1564`): a sketch is the engine's own definition (points, lines, circles, constraints: `SketchParams`), one for each plane, drawn, selected, dimensioned and trimmed here, and solved by the engine's solver
// at every edit (`interaction/drawing.ts`; no kernel). It turns the pointer into a place in the plane and the engine's answers into what the page shows: the lines, the bubbles of what is selected (`bubbledraw.ts`), a sentence.
// The tool that is on: Line, Rectangle, Circle (the figure goes on being made until the tool is put away), or Trim (a click on a piece of a line, arc or circle takes off the part between the places where others cross it).
import { project } from "./camera.ts";
import type { Ranked } from "./interaction/candidates.ts";
import { segsOf } from "./engine/definition.ts";
import type { Free } from "./engine/free.ts";
import { helpersAt, type Helped } from "./engine/helpers.ts";
import { regions } from "./engine/region.ts";
import type { SketchParams } from "./engine/sketch.ts";
import { trimAt } from "./engine/trim.ts";
import { measureAt, placeTyped, type TypedMeasure } from "./engine/typed.ts";
import { scopeOf } from "./interaction/bubbles.ts";
import { hitAt, keep, nextId, posOf, refOf, removeParts, tidy, type Ref, type Sol } from "./interaction/drawing.ts";
import { loopPoints, regionAt, type Region } from "./interaction/extrude.ts";
import { helpShown } from "./interaction/helpshow.ts";
import { type Mark } from "./interaction/marks.ts";
import { cancelFigure, newTool, toolClick, toolPreview, type Tool } from "./interaction/tools.ts";
import { kindsOfSelection } from "./interaction/toolspec.ts";
import { FIELDS, TYPED, chipFields, freeOf, madeNames, typeKey, typedMeasures } from "./interaction/typing.ts";
import type { PlacedMark } from "./markdraw.ts";
import type { Frame } from "./planes.ts";
import { vOf } from "./planes.ts";
import { settings } from "./settings.ts";
import { to3, type P2, type ToolKind } from "./sketch.ts";
import { createCore, type DrawLine, type Shape, type SketchHost } from "./sketchcore.ts";
import { createRegionSelect } from "./regionselect.ts";
import { createDrag } from "./sketchdrag.ts";
import { createMarks } from "./sketchmarks.ts";
import type { V3 } from "./vec.ts";

export type { DrawLine, SketchHost } from "./sketchcore.ts";

/** a part or a closed figure of a drawing under the pointer, one candidate of the page's list (`interaction/candidates.ts`) */
export interface SketchItem {
  from: "sketch";
  kind: "part" | "figure";
  /** the plane it is on, as the pointer meets it */
  plane: { key: string; p: SketchParams; q: P2; f: Frame; mm: number; tol: number; behind: boolean };
  id?: string;
}
export function createSketch(host: SketchHost, on?: (label: string, merge?: string) => void) {
  const K = createCore(host, on);
  const {
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
    dot,
    cross,
    helpDrawn,
    here,
    hereAll,
    set,
    fail,
    polyline,
  } = K;
  let tool: Tool | null = null;
  /** where a click would put the place: on a point or curve as drawn, else drawn to the helpers' places (they place, they never constrain, `dec_hints_place_only`, `in_1579`) */
  type PlaceResult = {
    ref: Ref;
    help: Helped | null;
    free: Free;
    /** the numbers typed for the figure, as measures to hold */ measures: TypedMeasure[];
  };
  let memo: { tool: Tool | null; p: SketchParams; x: number; y: number; mm: number; res: PlaceResult } | null = null; // (the same place is asked for by the preview, the chip and a click)
  const placed = (c: { p: SketchParams; q: P2; tol: number; mm: number }, s: Sol): PlaceResult => {
    if (memo && memo.tool === tool && memo.p === c.p && memo.x === c.q[0] && memo.y === c.q[1] && memo.mm === c.mm)
      return memo.res;
    const res = placeOf(c, s);
    memo = { tool, p: c.p, x: c.q[0], y: c.q[1], mm: c.mm, res };
    return res;
  };
  const placeOf = (c: { p: SketchParams; q: P2; tol: number; mm: number }, s: Sol): PlaceResult => {
    const r = refOf(c.p, s, c.q, c.tol),
      a = tool?.pts[0],
      pos = a ? posOf(s, a) : null,
      kind = tool && tool.kind !== "trim" ? tool.kind : null;
    const free: Free = kind && pos ? freeOf(kind, pos, a && "id" in a ? a.id : undefined) : { shape: "point" },
      sys = sysOf(c.p);
    // numbers typed hold the figure's size: the place is the pointer's, moved to where they hold, and no helper acts on it (`dec_dimensions_measure_then_lock`)
    if (kind && pos && tool!.typed.some((t) => t !== "")) {
      const live = FIELDS[kind].map((f) => measureAt(sys, free, c.q, f.kind, f.parts)),
        measures = typedMeasures(kind, tool!.typed, live),
        at = measures.length ? placeTyped(sys, free, c.q, measures) : null;
      if (at) return { ref: { at }, help: null, free, measures };
    }
    const h = helpersAt(sys, free, "id" in r ? s.points[r.id]! : c.q, c.mm, settings.helpers),
      co = h.acted.find((x) => x.relation === "coincident");
    if ("id" in r) return { ref: r, help: h.holds.length ? h : null, free, measures: [] };
    return h.acted.length
      ? { ref: co?.sources[0] ? { id: co.sources[0] } : { at: h.at }, help: h, free, measures: [] }
      : { ref: r, help: h.holds.length ? h : null, free, measures: [] };
  };
  let lastPointer: { x: number; y: number } | null = null,
    clickAt: ((x: number, y: number, count: number) => boolean) | null = null;
  /** a key while a figure is under way: digits, a point and a minus go to the active number, Backspace takes one away, Tab changes number, Enter makes the figure from what is typed (`typing.ts`) */
  const typeInTool = (code: string): boolean => {
    if (!tool || tool.kind === "trim" || !tool.pts.length || !FIELDS[tool.kind].length) return false;
    const n = FIELDS[tool.kind].length;
    if (code === "Tab") {
      if (n < 2) return false;
      tool = { ...tool, field: (tool.field + 1) % n };
      return true;
    }
    if (code === "Enter")
      return !!lastPointer && tool.typed.some((t) => t !== "") && !!clickAt?.(lastPointer.x, lastPointer.y, 1);
    const key = code === "Backspace" ? "Backspace" : TYPED[code];
    if (key === undefined) return false;
    const next = typeKey(tool.typed, tool.field, key);
    if (next.join("\u0000") === tool.typed.join("\u0000")) return key === "Backspace" ? false : true; // (a key that adds nothing, as a second point, is used up, a Backspace with nothing typed is not)
    tool = { ...tool, typed: next };
    return true;
  };
  type Trimmed =
    { id: string; out: ReturnType<typeof trimAt>; err?: undefined } | { id: string; err: string; out?: undefined };
  const trimHere = (c: NonNullable<ReturnType<typeof here>>): Trimmed | null => {
    const s = solOf(c.p),
      h = hitAt(c.p, s, c.q, c.tol);
    if (!h || h.kind !== "curve") return null;
    try {
      return { id: h.id, out: trimAt(c.p, h.id, h.at) };
    } catch (x) {
      return { id: h.id, err: (x as Error).message };
    }
  };

  /** the numbers of a figure under way, standing on it (null: no figure is under way): a line's length and a circle's diameter at the middle of it, a rectangle's width on its bottom side and its height on the side at the pointer */
  const fieldMarks = (c: { key: string; f: Frame; p: unknown }, at3: (m: Mark) => PlacedMark): PlacedMark[] | null => {
    const p = c.p as SketchParams;
    if (tool && tool.pts.length) {
      // a figure under way: its numbers stand on it, as they are measured (open) or typed (closed); they take digits from the keys and are not clicked
      if (tool.kind === "trim" || !FIELDS[tool.kind].length || !lastPointer) return [];
      const s = solOf(p),
        S = sysOf(p),
        hereNow = here(lastPointer.x, lastPointer.y),
        kind = tool.kind;
      if (!hereNow) return [];
      const pl = placed(hereNow, s),
        to = posOf(s, pl.ref),
        from = tool.pts[0] ? posOf(s, tool.pts[0]) : to,
        live = FIELDS[kind].map((f) => measureAt(S, pl.free, to, f.kind, f.parts));
      return chipFields(kind, tool.typed, tool.field, live).map((f) => {
        const where: P2 =
          kind === "rect"
            ? f.label === "Width"
              ? [(from[0] + to[0]) / 2, from[1]]
              : [to[0], (from[1] + to[1]) / 2]
            : [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]; // (a rectangle's width on its bottom side, its height on the side at the pointer)
        return at3({
          id: `field:${f.label}`,
          kind: "dimension",
          relation: "length",
          icon: "dimension",
          at: where,
          text: f.text,
          tone: "rest",
          title: f.label,
          parts: [],
          locked: f.typed,
          readonly: true,
          active: f.active,
          state: f.typed ? "locked" : "offer",
          alpha: 1,
          ...(f.label === "Diameter" ? { symbol: "Ø" } : {}),
        });
      });
    }
    return null;
  };
  const D = createDrag(K, () => tool !== null);
  /** the one arrow (`in_1671`, `in_1672`): a dashed line and an open tip, in the plane's axes, and **every tip stops `settings.sketch.arrowGapPx` short of what it points at** (so the direction reads and a point cannot clip it). `both`: a tip at each end (a dimension; each stops short of its end); `tail`: pixels the arrow starts away from where it is said to start (a bubble's arrow starts out of the bubble); `least`: no arrow when the two places are nearer than this many pixels */
  const arrow = (
    f: Frame,
    a: P2,
    b: P2,
    kind: "dash" | "dashOffer",
    o: { tail?: number; both?: boolean; least?: number; pale?: boolean } = {},
  ): DrawLine[] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      mm = mmPerPx(f, b);
    if (len < 1e-9 || len < (o.least ?? 0) * mm) return [];
    const gap = settings.sketch.arrowGapPx,
      ux = (b[0] - a[0]) / len,
      uy = (b[1] - a[1]) / len,
      tip = Math.min(gap * mm, len * 0.3),
      tail = Math.min((o.tail ?? (o.both ? gap : 0)) * mm, len * 0.3),
      from: P2 = [a[0] + ux * tail, a[1] + uy * tail],
      to: P2 = [b[0] - ux * tip, b[1] - uy * tip];
    const head = (at: P2, dx: number, dy: number): DrawLine => {
      const h = mm * settings.sketch.arrowHeadPx,
        w = (sg: number): P2 => [
          at[0] - h * (dx * Math.cos(0.45) - sg * dy * Math.sin(0.45)),
          at[1] - h * (dy * Math.cos(0.45) + sg * dx * Math.sin(0.45)),
        ];
      return { kind, pts: [to3(f, w(1)), to3(f, at), to3(f, w(-1))], head: true, ...(o.pale ? { pale: true } : {}) };
    };
    return [
      { kind, pts: [to3(f, from), to3(f, to)], dash: dashAt(f, a), ...(o.pale ? { pale: true } : {}) },
      head(to, ux, uy),
      ...(o.both ? [head(from, -ux, -uy)] : []),
    ];
  };
  /** one shape of a pointed-at mark as lines: yellow when it is an offer's, else neutral (`in_1675`) */
  const shape = (f: Frame, z: Shape, offer: boolean): DrawLine[] => {
    const kind = offer && !(z.t === "arrow" && z.plain) ? "dashOffer" : "dash";
    if (z.t === "arrow") return arrow(f, z.a, z.b, kind, z);
    if (z.t === "line") return [{ kind, pts: [to3(f, z.a), to3(f, z.b)], dash: dashAt(f, z.a) }];
    if (z.t === "thin") return [{ kind: "dimExt", pts: [to3(f, z.a), to3(f, z.b)] }];
    return [{ kind: "dimArc", pts: z.pts.map((q) => to3(f, q)) }];
  };
  const M = createMarks(K, { dragged: D.dragged, fieldMarks });
  const R = createRegionSelect(K);
  type Here = NonNullable<ReturnType<typeof here>>;
  /** a click with the trim tool */
  const trimClick = (c: Here): void => {
    const t = trimHere(c);
    if (!t) say("Click a line, an arc or a circle to trim it");
    else if (t.err !== undefined) fail(t.err, []);
    else {
      set(c.key, t.out.params, "Trim");
      st.flash = {};
      say(
        t.out.dropped.length
          ? `Trimmed. Let go: ${t.out.dropped.map((d) => `${d.kind} (${d.why})`).join("; ")}`
          : "Trimmed",
      );
    }
  };
  /** the numbers typed for a figure, locked as dimensions of what was made (`names` says which made part each `~` stands for) */
  const lockTyped = (made: SketchParams, sol: Sol, pl: PlaceResult, at: P2, start: P2 | null): SketchParams => {
    const names = madeNames(made, sol, at, start);
    let withLocks = made;
    for (const m of pl.measures) {
      const parts = m.parts.map((x) => (x.startsWith("~") ? names[x as keyof typeof names] : x));
      if (parts.every((x) => x))
        withLocks = {
          ...withLocks,
          constraints: [
            ...(withLocks.constraints ?? []),
            {
              id: nextId(withLocks, "c"),
              kind: m.kind,
              parts: parts as string[],
              value: Math.round(m.value * 1e6) / 1e6,
            },
          ],
        };
    }
    const k = keep(withLocks);
    if (k.ok) return k.params;
    say(`The numbers typed could not be locked: ${k.why}`);
    return made;
  };
  /** a click with a drawing tool: the next place of the figure, and the figure itself when it is complete (with the numbers typed for it, one change) */
  const drawClick = (c: Here): void => {
    const t = tool!,
      s = solOf(c.p),
      pl = placed(c, s),
      done = toolClick(t, c.p, s, pl.ref);
    if (done.made && !done.made.params) {
      say("Nothing to make there: the figure would have no size"); // (the figure stays as it was, its first click kept)
      return;
    }
    const start = t.pts[0] ? posOf(s, t.pts[0]) : null;
    tool = done.tool;
    if (!done.made?.params) return;
    const k = keep(done.made.params);
    if (!k.ok) return fail(k.why, k.victims);
    set(
      c.key,
      pl.measures.length ? lockTyped(k.params, k.sol, pl, posOf(s, pl.ref), start) : k.params,
      done.made.label,
    );
    // what was just made is offered what is true of it for a while (its marks), selected or not (a rectangle's four sides too)
    const ids = (p: SketchParams) => [...(p.lines ?? []), ...(p.circles ?? []), ...(p.arcs ?? [])].map((x) => x.id),
      had = new Set(ids(c.p));
    st.recent = {
      key: c.key,
      ids: ids(defs.get(c.key)!).filter((id) => !had.has(id)),
      until: performance.now() + settings.marks.stayMs,
    };
    sel.clear();
  };

  const api = {
    active: () => tool !== null,
    /** how many places of the figure under way are down (null: no drawing tool is on) */
    drawStep: (): number | null => (tool ? tool.pts.length : null),
    /** which tool is on (null: none) */
    toolKind: (): string | null => tool?.kind ?? null,
    /** the kinds of the parts selected in the sketch of the plane that is on */
    selectedKinds: (): string[] => {
      const c = current();
      return c ? kindsOfSelection(sysOf(c.p), selected(c.key)) : [];
    },
    tool: (): ToolKind | null => tool?.kind ?? null,
    start(kind: ToolKind) {
      tool = newTool(kind);
      sel.clear();
    },
    /** Right click or Esc: the figure under way is given up; with none, the tool is put away. Returns whether there was a tool. */
    stop(): boolean {
      if (!tool) return false;
      if (tool.pts.length) tool = cancelFigure(tool);
      else tool = null;
      return true;
    },
    /** A click. With a tool on it is the tool's (a double click ends a line's chain); with none, it selects (Shift adds). Returns whether it was used. */
    click(x: number, y: number, count: number, shift = false): boolean {
      const c = here(x, y);
      if (!tool) return false; // (picking is the page's: one list of what is under the pointer, `interaction/candidates.ts`)
      if (count >= 2 && tool.kind === "line") {
        tool = cancelFigure(tool);
        return true;
      }
      if (!c) return true;
      if (tool.kind === "trim") trimClick(c);
      else drawClick(c);
      return true;
    },
    /** Keys of the sketch: Delete takes the selected parts away (no other key is bound for now, `in_1574`). Returns whether the key was used. */
    key(code: string): boolean {
      const c = current();
      if (!c) return false;
      if (tool) return typeInTool(code); // (a figure under way: the keys type its numbers)
      const typed = TYPED[code]; // (digits typed with a part selected go to its own number, `dec_typing_standard`)
      if (typed !== undefined && M.ownId() && !host.editing()) return host.startEdit(M.ownId()!, typed);
      const ids = selected(c.key);
      if (code === "Delete" || code === "Backspace") {
        if (!ids.length) return false;
        set(c.key, removeParts(c.p, ids), "Delete");
        sel.clear();
        return true;
      }
      return false;
    },
    /** Every sketch, by plane (for the history); `restore` puts them back as they were (the selection and the tool are put away). */
    snapshot: (): Record<string, SketchParams> => Object.fromEntries(defs),
    restore(snap: Record<string, SketchParams>): void {
      defs.clear();
      for (const [k, v] of Object.entries(snap)) defs.set(k, tidy(v));
      sel.clear();
      tool = null;
      st.flash = {};
      st.recent = st.hover = st.shown = null;
    },
    /** What to draw: every sketch on every plane (what is selected in teal), what the tool would make, the part a trim would take, and the place the pointer is at. */
    lines(pointer: { x: number; y: number } | null): DrawLine[] {
      if (pointer) lastPointer = pointer;
      const { all } = host.planes(),
        out: DrawLine[] = [];
      for (const k of [...defs.keys()]) if (!all.has(k)) defs.delete(k); // (the plane is gone, and its sketch)
      for (const [k, p] of defs) {
        const f = all.get(k)!,
          s = solOf(p),
          chosen = new Set(selected(k)),
          seg = segsOf(p, s.points, s.radii);
        for (const q of seg)
          out.push({
            kind: chosen.has(q.name) ? "selected" : "done",
            pts: polyline(q).map((z) => to3(f, z)),
            hidden: true,
          }); // (hidden by a body in front of it, as a body's own edges are: a drawing a body was made from does not show through it)
        const shownPts = chosen.size ? new Set(scopeOf(sysOf(p), [...chosen])) : chosen; // (what is selected shows what it is made of: a circle its centre, a line its ends, an arc its centre and ends)
        for (const x of p.points) {
          const at = shownPts.has(x.id) ? s.points[x.id] : null;
          if (at) out.push({ ...dot(f, at, "figure"), hidden: true });
        } // (the old app marks no point until it is picked, then a teal ball)
        // a circle's and an arc's centre is always there to see, a small dot; picked, it is the teal ball above (`in_1646`)
        for (const id of new Set([...(p.circles ?? []).map((k) => k.c), ...(p.arcs ?? []).map((a) => a.c)])) {
          const at = shownPts.has(id) ? null : s.points[id];
          if (at) out.push({ ...dot(f, at, "axis", 0.55), hidden: true }); // (a point of a drawing is hidden by a body in front of it, as its lines are)
        }
        // what the pointed-at mark shows: its parts lit in its colour (blue for an applied constraint, yellow for an offer; a named point also lights the lines that end at it; only colour changes, never the weight, `in_1657`, `in_1661`), a dot on each named point, and its shapes, all by the one routine (`in_1675`)
        if (st.shown && st.shown.key === k) {
          const sh = st.shown,
            names = new Set(sh.parts);
          for (const l of p.lines ?? []) if (names.has(l.a) || names.has(l.b)) names.add(l.id);
          for (const q of seg)
            if (names.has(q.name))
              out.push({
                kind: sh.offer ? (chosen.has(q.name) ? "litOfferSel" : "litOffer") : "lit",
                pts: polyline(q).map((z) => to3(f, z)),
              });
          for (const id of sh.parts) {
            const at = s.points[id];
            if (at) out.push(dot(f, at, sh.offer ? "ties" : "figure"));
          }
          for (const z of sh.shapes) out.push(...shape(f, z, sh.offer));
        }
      }
      out.push(...D.hintLines(all));
      const c = pointer && tool ? here(pointer.x, pointer.y) : null;
      if (c && tool) {
        const s = solOf(c.p);
        if (tool.kind === "trim") {
          const t = trimHere(c);
          if (t?.out) out.push({ kind: "cut", pts: t.out.span.map((z) => to3(c.f, z)) });
        } else {
          const pl = placed(c, s),
            at = posOf(s, pl.ref);
          for (const l of toolPreview(tool, s, at)) out.push({ kind: l.kind, pts: l.pts.map((z) => to3(c.f, z)) });
          const shown = pl.help
            ? helpShown(
                pl.help,
                (part) => {
                  const g = segsOf(c.p, s.points, s.radii).find((x) => x.name === part);
                  return g ? polyline(g) : null;
                },
                (id) => s.points[id] ?? null,
              )
            : [];
          out.push(...helpDrawn(c.f, shown, at), ...cross(c.f, at));
        }
      }
      return out;
    },
    grab: D.grab,
    grabMove: D.grabMove,
    grabEnd: D.grabEnd,
    marks: M.marks,
    frame: (now: number): void => M.frame(now, D.held()),
    handlers: M.handlers,
    constrain: M.constrain,
    dismissOffers: M.dismissOffers,
    press: M.act,
    /** The closed parts of every drawing, to be tinted (a closed figure has a very faint fill in the old app, `in_194`; every closed part, also where figures overlap): the outline and holes in each plane's axes. */
    fills(): { frame: { origin: V3; u: V3; v: V3 }; loops: [number, number][][] }[] {
      const { all } = host.planes(),
        out: { frame: { origin: V3; u: V3; v: V3 }; loops: [number, number][][] }[] = [];
      for (const [k, p] of defs) {
        const f = all.get(k);
        if (!f) continue;
        let loops = fillCache.get(p);
        if (!loops) {
          try {
            const sol = solOf(p),
              segs = segsOf(p, sol.points, sol.radii);
            // every closed part, one by one (not the even-odd sum, which leaves out where figures overlap): each is a face of its own, as it is picked
            loops = regions(segs).faces.flatMap((f) => {
              const q = regions(segs, { pick: [f.sample] }).profiles[0];
              return q ? [[loopPoints(q.outer), ...q.holes.map(loopPoints)] as [number, number][][]] : [];
            });
          } catch {
            loops = [];
          }
          fillCache.set(p, loops);
        }
        for (const l of loops) out.push({ frame: { origin: f.origin, u: f.u, v: vOf(f) }, loops: l });
      }
      return out;
    },
    /** The closed figures picked and pointed at, to be drawn lit, and where the orb stands (`regionselect.ts`). */
    litRegions: R.lit,
    /** The pointer is at (x, y): is a closed figure under it (and no part of the drawing nearer)? */
    /** The figure pointed at (null: none), chosen from the candidates (`interaction/candidates.ts`). */
    hoverFigure: (item: SketchItem | null): void => R.point(item?.kind === "figure" ? item.plane : null),
    leaveRegion: R.leave,
    /** What is under the pointer of the drawings, on any plane that has one, as candidates of the one list: a point, a line, circle or arc (nearest the pointer), a closed figure (a surface); what is behind a body's surface is not there. */
    candidates(x: number, y: number): Ranked<SketchItem>[] {
      const { cam, w, h } = host.view(),
        out: Ranked<SketchItem>[] = [];
      for (const c of hereAll(x, y)) {
        if (c.behind) continue;
        const depth = project(cam, to3(c.f, c.q), w, h).depth,
          hit = hitAt(c.p, solOf(c.p), c.q, c.tol);
        if (hit)
          out.push({
            rank: hit.kind === "point" ? 0 : 1,
            px: hit.d / c.mm,
            depth,
            item: { from: "sketch", kind: "part", plane: c, id: hit.id },
          });
        if (R.has(c))
          out.push({ rank: 2, px: 0, depth, figure: true, item: { from: "sketch", kind: "figure", plane: c } });
      }
      return out;
    },
    /** Pick a candidate the page chose (a part: with Shift it is added to what is picked, or taken out; a figure). */
    pickItem(item: SketchItem, shift: boolean): boolean {
      if (item.kind === "part") {
        pick(item.plane.key, item.id!, shift);
        return true;
      }
      return R.pick(item.plane);
    },
    /** The figure a place of a plane is inside, with its drawing and plane (what an extrude is made from). */
    regionIn: R.at,
    /** The region of the drawing on the plane that is on under the pointer, with the sketch and the plane it is of (what an extrude is made from); null: none. */
    regionAt(x: number, y: number): { key: string; frame: Frame; def: SketchParams; region: Region; click: V3 } | null {
      for (const c of hereAll(x, y)) {
        if (c.behind) continue; // (a figure behind a body's surface is not there)
        const region = regionAt(c.p, c.q);
        if (region) return { key: c.key, frame: c.f, def: c.p, region, click: to3(c.f, c.q) };
      }
      return null;
    },
    /** The parts of drawings wholly in a box on the screen and not hidden behind a body (curves: lines, circles, arcs; none of those: the points), on the plane that has most of them, picked. Returns whether any. */
    boxParts(box: { x0: number; y0: number; x1: number; y1: number }): boolean {
      const { cam, w, h } = host.view(),
        { all } = host.planes(),
        lo = { x: Math.min(box.x0, box.x1), y: Math.min(box.y0, box.y1) },
        hi = { x: Math.max(box.x0, box.x1), y: Math.max(box.y0, box.y1) },
        seen = (p: V3): boolean => {
          const q = project(cam, p, w, h);
          return (cam.ortho !== null || q.depth > 1e-6) && q.x >= lo.x && q.x <= hi.x && q.y >= lo.y && q.y <= hi.y;
        },
        shown = (p: V3): boolean => {
          const q = project(cam, p, w, h);
          return !host.inFront(p, q.x, q.y); // (not behind a body's surface)
        };
      let best: { key: string; ids: string[] } | null = null;
      for (const [key, p] of defs) {
        const f = all.get(key);
        if (!f) continue;
        const s = solOf(p),
          curves = segsOf(p, s.points, s.radii).flatMap((q) => {
            const pts = polyline(q).map((z) => to3(f, z));
            return pts.length && pts.every(seen) && shown(pts[Math.floor(pts.length / 2)]!) ? [q.name] : [];
          }),
          ids = curves.length
            ? curves
            : p.points
                .filter((x) => s.points[x.id] && seen(to3(f, s.points[x.id]!)) && shown(to3(f, s.points[x.id]!)))
                .map((x) => x.id);
        if (ids.length > (best?.ids.length ?? 0)) best = { key, ids };
      }
      if (!best) return false;
      sel.setSketch(best.key, best.ids);
      return true;
    },
    /** Whether any plane has something drawn on it (what the Extrude tool needs). */
    hasDrawing: (): boolean =>
      [...defs.values()].some((p) => (p.lines?.length ?? 0) + (p.circles?.length ?? 0) + (p.arcs?.length ?? 0) > 0),
    /** The sketch of a plane, as the definition (for the extrude). */
    sketchOf: (key: string): SketchParams | null => defs.get(key) ?? null,
    /** a press of the helper bar by its id (`delete`, `clear`, `rel:<relation>`): for the dev checks */
    debug: () => ({
      drag: D.debug(),
      tool: tool ? { ...tool } : null,
      sketches: [...defs].map(([k, v]) => [k, v] as const),
      selection: (() => {
        const k = sel.get();
        return k?.kind === "sketch" ? { key: k.key, ids: k.ids } : { key: "", ids: [] };
      })(),
    }),
  };
  clickAt = (x, y, count) => api.click(x, y, count);
  return api;
}
