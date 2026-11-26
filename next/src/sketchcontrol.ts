// The sketching controller (`in_1564`): a sketch is the engine's own definition (points, lines, circles, constraints: `SketchParams`), one for each plane, drawn, selected, dimensioned and trimmed here, and solved by the engine's solver
// at every edit (`interaction/drawing.ts`; no kernel). It turns the pointer into a place in the plane and the engine's answers into what the page shows: the lines, the bubbles of what is selected (`bubbledraw.ts`), a sentence.
// The tool that is on: Line, Rectangle, Circle (the figure goes on being made until the tool is put away), or Trim (a click on a piece of a line, arc or circle takes off the part between the places where others cross it).
import { viewHeight, forwardDepth, project, type Cam } from "./camera.ts";
import { onPlane, to2, to3, type P2, type ToolKind } from "./sketch.ts";
import type { Frame } from "./planes.ts";
import { vOf } from "./planes.ts";
import { add, scale, type V3 } from "./vec.ts";
import type { SketchParams } from "./engine/sketch.ts";
import { solveDefinition, segsOf } from "./engine/definition.ts";
import { pointOnSeg, type Pt } from "./engine/region.ts";
import { trimAt } from "./engine/trim.ts";
import type { Relation } from "./engine/solver.ts";
import type { Selection } from "./selection.ts";
import type { NoticeOptions } from "./interaction/notices.ts";
import { bake, constrain, emptySketch, hitAt, keep, nextId, posOf, refOf, removeParts, retype, unconstrain, viewSystem, type Ref, type Sol } from "./interaction/drawing.ts";
import { MEASURE_ID, angleMark, bubblesOn, type Flash } from "./interaction/bubbles.ts";
import { marksFor, type Mark, type Recent } from "./interaction/marks.ts";
import type { MarkHandlers, PlacedMark } from "./markdraw.ts";
import { settings } from "./settings.ts";
import { kindsOfSelection } from "./interaction/toolspec.ts";
import { nearConstraint, type Fact } from "./interaction/infobar.ts";
import type { InfoHandlers } from "./infobardraw.ts";
import { helpersAt, type Helped } from "./engine/helpers.ts";
import type { Free } from "./engine/free.ts";
import { measureAt, placeTyped, type TypedMeasure } from "./engine/typed.ts";
import { FIELDS, chipFields, freeOf, madeNames, typeKey, typedMeasures } from "./interaction/typing.ts";
import { helpShown } from "./interaction/helpshow.ts";
import { newTool, cancelFigure, toolClick, toolPreview, type Tool } from "./interaction/tools.ts";
import { dragRadius, dragTo, freeOfDrag, joinFor, pieceOf, pinsOf, without } from "./interaction/dragging.ts";
import { loopPoints, regionAt, type Region } from "./interaction/extrude.ts";
import { regions } from "./engine/region.ts";

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
export interface DrawLine { pts: V3[]; /** a ball's radius, in mm */ r?: number; /** a dashed line's dash, in mm (the gap is 0.7 of it) */ dash?: number; kind: "done" | "selected" | "preview" | "cursor" | "cut" | "tie" | "tieBall" | "guide" | "ball" | "note" }

/** the keys that type a number (and what each types) */
const TYPED: Record<string, string> = { ...Object.fromEntries([...Array(10).keys()].flatMap((d) => [[`Digit${d}`, String(d)], [`Numpad${d}`, String(d)]])), Period: ".", NumpadDecimal: ".", Minus: "-", NumpadSubtract: "-" };

export function createSketch(host: SketchHost, on?: (label: string, merge?: string) => void) {
  const defs = new Map<string, SketchParams>(), sols = new WeakMap<SketchParams, Sol>(), fillCache = new WeakMap<SketchParams, [number, number][][][]>();
  const sel = host.selection;
  let tool: Tool | null = null, flash: Flash = {}, flashUntil = 0, recent: (Recent & { key: string }) | null = null; // (recent: the parts just made, whose offers show for a while even when nothing is selected, `dec_marks_on_things`)
  const say = (text: string, ms = 4000) => host.notify(text, { ttl: ms });
  const systems = new WeakMap<SketchParams, ReturnType<typeof viewSystem>>(), sysOf = (p: SketchParams) => { let y = systems.get(p); if (!y) { y = viewSystem(p, solOf(p)); systems.set(p, y); } return y; }; // (a definition has one system: asked for by every part of a frame)
  const solOf = (p: SketchParams): Sol => { let s = sols.get(p); if (!s) { const r = solveDefinition(p); s = { points: r.points, radii: r.radii }; sols.set(p, s); } return s; };
  const current = () => { const { all, on } = host.planes(); const f = all.get(on); return f ? { key: on, f, p: defs.get(on) ?? emptySketch() } : null; };
  const selected = (key: string): string[] => [...sel.sketch(key)];
  /** a pixel's worth of the plane in mm, where the pointer is */
  /** where a click would put the place: on a point or curve as drawn, else drawn to the helpers' places (they place, they never constrain, `dec_hints_place_only`, `in_1579`) */
  type PlaceResult = { ref: Ref; help: Helped | null; free: Free; /** the numbers typed for the figure, as measures to hold */ measures: TypedMeasure[] };
  let memo: { tool: Tool | null; p: SketchParams; x: number; y: number; res: PlaceResult } | null = null; // (the same place is asked for by the preview, the chip and a click)
  const placed = (c: { p: SketchParams; q: P2; tol: number; mm: number }, s: Sol): PlaceResult => {
    if (memo && memo.tool === tool && memo.p === c.p && memo.x === c.q[0] && memo.y === c.q[1]) return memo.res;
    const res = placeOf(c, s); memo = { tool, p: c.p, x: c.q[0], y: c.q[1], res }; return res;
  };
  const placeOf = (c: { p: SketchParams; q: P2; tol: number; mm: number }, s: Sol): PlaceResult => {
    const r = refOf(c.p, s, c.q, c.tol), a = tool?.pts[0], pos = a ? posOf(s, a) : null, kind = tool && tool.kind !== "trim" ? tool.kind : null;
    const free: Free = kind && pos ? freeOf(kind, pos, a && "id" in a ? a.id : undefined) : { shape: "point" }, sys = sysOf(c.p);
    // numbers typed hold the figure's size: the place is the pointer's, moved to where they hold, and no helper acts on it (`dec_dimensions_measure_then_lock`)
    if (kind && pos && tool!.typed.some((t) => t !== "")) {
      const live = FIELDS[kind].map((f) => measureAt(sys, free, c.q, f.kind, f.parts)), measures = typedMeasures(kind, tool!.typed, live), at = measures.length ? placeTyped(sys, free, c.q, measures) : null;
      if (at) return { ref: { at }, help: null, free, measures };
    }
    const h = helpersAt(sys, free, "id" in r ? s.points[r.id]! : c.q, c.mm, settings.helpers), co = h.acted.find((x) => x.relation === "coincident");
    if ("id" in r) return { ref: r, help: h.holds.length ? h : null, free, measures: [] };
    return h.acted.length ? { ref: co?.sources[0] ? { id: co.sources[0] } : { at: h.at }, help: h, free, measures: [] } : { ref: r, help: h.holds.length ? h : null, free, measures: [] };
  };
  /** an angle as the old app draws it: a thin arc at the corner of the two lines (about 34 px across, not past the shorter line), and where its number stands on it */
  const angleMarkAt = (f: Frame, S: ReturnType<typeof sysOf>, parts: readonly string[]): { arc: P2[]; at: P2 } | null => {
    const m = angleMark(S, parts); if (!m) return null;
    const mm = mmPerPx(f, m.centre), r = Math.min(34 * mm, m.reach * 0.8), n = Math.max(6, Math.ceil(Math.abs(m.sweep) / 0.1)), mid = m.from + m.sweep / 2;
    return { arc: Array.from({ length: n + 1 }, (_, i) => [m.centre[0] + r * Math.cos(m.from + (m.sweep * i) / n), m.centre[1] + r * Math.sin(m.from + (m.sweep * i) / n)] as P2), at: [m.centre[0] + (r + 16 * mm) * Math.cos(mid), m.centre[1] + (r + 16 * mm) * Math.sin(mid)] };
  };
  /** the dash of a guide, as the old app's (`settings.helpers.dash` of the view's distance; worked from the view's height over twice the tangent of half its angle, so it is the same in the straight view) */
  const dashAt = (f: Frame, q: P2) => { const { cam } = host.view(); return (viewHeight(cam, Math.max(forwardDepth(cam, to3(f, q)), 1e-3)) * settings.helpers.dash) / (2 * Math.tan((settings.view.fovDeg * Math.PI) / 360)); };
  const mmPerPx = (f: Frame, q: P2) => { const { cam, h } = host.view(); return viewHeight(cam, Math.max(forwardDepth(cam, to3(f, q)), 1e-3)) / h; };
  const here = (x: number, y: number) => {
    const c = current(); if (!c) return null;
    const r = host.ray(x, y), q = onPlane(c.f, r.o, r.d); if (!q) return null;
    const mm = mmPerPx(c.f, to2(c.f, q));
    return { ...c, q: to2(c.f, q), mm, tol: mm * settings.sketch.snapPx };
  };
  /** a change of a sketch: kept, and said to whoever keeps the history (`label`: what it was; `merge`: changes with the same key are one, a number typed again and again) */
  const set = (key: string, p: SketchParams, label: string, merge?: string) => { defs.set(key, p); on?.(label, merge); };
  const fail = (why: string, victims: string[]) => { host.notify(why, { kind: "warn", ttl: 4000 }); flash = { refused: victims }; flashUntil = performance.now() + 1800; };

  // ---- a part dragged: the solver follows the pointer with the part pinned where it goes (soft: it goes as near as the constraints allow); a point let go on another point or on a curve joins it
  type Drag = { key: string; def0: SketchParams; pins: string[]; start: Record<string, [number, number]>; q0: P2; x0: number; y0: number; moved: boolean; shift: boolean; id: string; join: { id: string; kind: "point" | "curve" } | null; snapAt: P2 | null; /** a circle's edge pressed: its radius follows the pointer (the circle, its centre) */ edge: { circle: string; centre: string } | null; /** what the helpers say of where it is (the same rules as when it was drawn: they place, they never constrain) */ help: Helped | null };
  let drag: Drag | null = null;

  /** what the info bar's buttons do (`dec_three_surfaces`): a suggestion is applied; a constraint clicked is taken away; a number typed over is the number (a measured one locks); a padlock locks or lets go */
  const handlers: MarkHandlers = {
    suggest(id) {
      const c = current(); if (!c) return;
      const nc = nearConstraint(id);
      if (!nc) { act(id); return; }
      const k = keep({ ...c.p, constraints: [...(c.p.constraints ?? []), { id: nextId(c.p, "c"), kind: nc.kind, parts: nc.parts, ...(nc.internal ? { internal: true } : {}) }] });
      if (k.ok) set(c.key, k.params, "Constraint"); else fail(k.why, k.victims);
    },
    /** an offered constraint, from a mark: the parts it is offered for are selected, and it is applied */
    offer(id, over) { const c = current(); if (!c) return; sel.setSketch(c.key, over); recent = null; this.suggest(id); },
    fact(id) {
      const c = current(); if (!c) return;
      const r = unconstrain(c.p, id); if (r.ok) set(c.key, r.params, "Delete constraint"); else fail(r.why, r.victims);
    },
    set(id, value) {
      const c = current(); if (!c) return;
      if (id === MEASURE_ID) { lockMeasure(value); return; } // (a number typed over one that is only measured locks it at that number)
      const r = retype(c.p, id, value);
      if (r.ok) { set(c.key, r.params, "Number", `n:${id}`); flash = {}; } else fail(r.why, r.victims);
    },
    lock(id) {
      const c = current(); if (!c) return;
      if (id === MEASURE_ID) { lockMeasure(); return; } // (measured: lock it at what it measures now)
      const r = unconstrain(c.p, id); if (r.ok) set(c.key, r.params, "Unlock"); else fail(r.why, r.victims); // (locked: let it go; it is only measured again)
    },
  };

  /** the selection's own number locked: at what it measures now, or at the number typed */
  const lockMeasure = (value?: number) => {
    const c = current(); if (!c) return;
    const r = constrain(c.p, solOf(c.p), selected(c.key), "dimension", value);
    if (r.ok) { set(c.key, r.params, value === undefined ? "Lock number" : "Number"); flash = { applied: [r.added] }; flashUntil = performance.now() + 900; } else fail(r.why, r.victims);
  };
  /** a press on the helper bar: a relation is put on the selection */
  const act = (id: string): void => {
    const c = current(); if (!c) return;
    if (id.startsWith("rel:")) {
      const r = constrain(c.p, solOf(c.p), selected(c.key), id.slice(4) as Relation | "dimension");
      if (r.ok) { set(c.key, r.params, "Constraint"); flash = { applied: [r.added] }; flashUntil = performance.now() + 900; } else fail(r.why, r.victims);
    }
  };

  /** a figure made with a click: kept if the engine accepts it */
  const commit = (key: string, next: SketchParams | null, label: string) => {
    if (!next) return;
    const k = keep(next);
    if (k.ok) set(key, k.params, label); else fail(k.why, k.victims);
  };
  let ownId: string | null = null, lastPointer: { x: number; y: number } | null = null, clickAt: ((x: number, y: number, count: number) => boolean) | null = null;
  /** a key while a figure is under way: digits, a point and a minus go to the active number, Backspace takes one away, Tab changes number, Enter makes the figure from what is typed (`typing.ts`) */
  const typeInTool = (code: string): boolean => {
    if (!tool || tool.kind === "trim" || !tool.pts.length || !FIELDS[tool.kind].length) return false;
    const n = FIELDS[tool.kind].length;
    if (code === "Tab") { if (n < 2) return false; tool = { ...tool, field: (tool.field + 1) % n }; return true; }
    if (code === "Enter") return !!lastPointer && tool.typed.some((t) => t !== "") && !!clickAt?.(lastPointer.x, lastPointer.y, 1);
    const key = code === "Backspace" ? "Backspace" : TYPED[code]; if (key === undefined) return false;
    const next = typeKey(tool.typed, tool.field, key);
    if (next.join("\u0000") === tool.typed.join("\u0000")) return key === "Backspace" ? false : true; // (a key that adds nothing, as a second point, is used up, a Backspace with nothing typed is not)
    tool = { ...tool, typed: next }; return true;
  };
  type Trimmed = { id: string; out: ReturnType<typeof trimAt>; err?: undefined } | { id: string; err: string; out?: undefined };
  const trimHere = (c: NonNullable<ReturnType<typeof here>>): Trimmed | null => {
    const s = solOf(c.p), h = hitAt(c.p, s, c.q, c.tol);
    if (!h || h.kind !== "curve") return null;
    try { return { id: h.id, out: trimAt(c.p, h.id, h.at) }; } catch (x) { return { id: h.id, err: (x as Error).message }; }
  };
  const polyline = (s: ReturnType<typeof segsOf>[number]): Pt[] => s.kind === "line" ? [s.a, s.b] : Array.from({ length: 65 }, (_, k) => pointOnSeg(s, (k / 64) * s.sweep));

  const api = {
    active: () => tool !== null,
    /** how many places of the figure under way are down (null: no drawing tool is on) */
    drawStep: (): number | null => (tool ? tool.pts.length : null),
    /** the kinds of the parts selected in the sketch of the plane that is on */
    selectedKinds: (): string[] => { const c = current(); return c ? kindsOfSelection(sysOf(c.p), selected(c.key)) : []; },
    tool: (): ToolKind | null => tool?.kind ?? null,
    start(kind: ToolKind) { tool = newTool(kind); sel.clear(); },
    /** Right click or Esc: the figure under way is given up; with none, the tool is put away. Returns whether there was a tool. */
    stop(): boolean {
      if (!tool) return false;
      if (tool.pts.length) tool = cancelFigure(tool); else tool = null;
      return true;
    },
    /** A click. With a tool on it is the tool's (a double click ends a line's chain); with none, it selects (Shift adds). Returns whether it was used. */
    click(x: number, y: number, count: number, shift = false): boolean {
      const c = here(x, y);
      if (!tool) {
        if (!c) return false;
        const h = hitAt(c.p, solOf(c.p), c.q, c.tol);
        if (!h) { const had = selected(c.key).length > 0; if (had) sel.clear(); return had; } // (only a sketch selection is the sketch's to put away: a click that hits no part goes on to the bodies)
        const was = selected(c.key), id = h.id; sel.setSketch(c.key, shift ? (was.includes(id) ? was.filter((q) => q !== id) : [...was, id]) : [id]);
        return true;
      }
      if (count >= 2 && tool.kind === "line") { tool = cancelFigure(tool); return true; }
      if (!c) return true;
      if (tool.kind === "trim") {
        const t = trimHere(c);
        if (!t) say("Click a line, an arc or a circle to trim it");
        else if (t.err !== undefined) fail(t.err, []);
        else { set(c.key, t.out.params, "Trim"); flash = {}; say(t.out.dropped.length ? `Trimmed. Let go: ${t.out.dropped.map((d) => `${d.kind} (${d.why})`).join("; ")}` : "Trimmed"); }
        return true;
      }
      const s = solOf(c.p), pl = placed(c, s), done = toolClick(tool, c.p, s, pl.ref), start = tool.pts[0] ? posOf(s, tool.pts[0]) : null;
      tool = done.tool;
      if (done.made?.params) { // the figure, with the numbers typed for it locked as dimensions, is one change
        const before = c.p, made = done.made, k = keep(made.params!), at = posOf(s, pl.ref);
        if (!k.ok) fail(k.why, k.victims);
        else {
          let final = k.params;
          if (pl.measures.length) {
            const names = madeNames(final, k.sol, at, start); let withLocks = final;
            for (const m of pl.measures) { const parts = m.parts.map((x) => (x.startsWith("~") ? names[x as keyof typeof names] : x)); if (parts.every((x) => x)) withLocks = { ...withLocks, constraints: [...(withLocks.constraints ?? []), { id: nextId(withLocks, "c"), kind: m.kind, parts: parts as string[], value: Math.round(m.value * 1e6) / 1e6 }] }; }
            const k2 = keep(withLocks); if (k2.ok) final = k2.params; else say(`The numbers typed could not be locked: ${k2.why}`);
          }
          set(c.key, final, made.label);
          // what was just made is offered what is true of it for a while (its marks), selected or not (a rectangle's four sides too)
          const p2 = defs.get(c.key)!, had = new Set([...(before.lines ?? []), ...(before.circles ?? []), ...(before.arcs ?? [])].map((x) => x.id)), made1 = [...(p2.lines ?? []), ...(p2.circles ?? []), ...(p2.arcs ?? [])].filter((x) => !had.has(x.id));
          recent = { key: c.key, ids: made1.map((x) => x.id), until: performance.now() + settings.marks.stayMs }; sel.clear();
        }
      }
      return true;
    },
    /** Keys of the sketch: Delete takes the selected parts away (no other key is bound for now, `in_1574`). Returns whether the key was used. */
    key(code: string): boolean {
      const c = current(); if (!c) return false;
      if (tool) return typeInTool(code); // (a figure under way: the keys type its numbers)
      const typed = TYPED[code]; // (digits typed with a part selected go to its own number, `dec_typing_standard`)
      if (typed !== undefined && ownId && !host.editing()) return host.startEdit(ownId, typed);
      const ids = selected(c.key);
      if (code === "Delete" || code === "Backspace") { if (!ids.length) return false; set(c.key, removeParts(c.p, ids), "Delete"); sel.clear(); return true; }
      return false;
    },
    /** Add a relation to what is selected (the helper bar's, later); false: the sketch said no, and says why. */
    constrain(kind: Relation | "dimension"): boolean {
      const c = current(); if (!c) return false;
      const r = constrain(c.p, solOf(c.p), selected(c.key), kind);
      if (r.ok) { set(c.key, r.params, "Constraint"); flash = { applied: [r.added] }; flashUntil = performance.now() + 900; return true; }
      fail(r.why, r.victims); return false;
    },
    /** Every sketch, by plane (for the history); `restore` puts them back as they were (the selection and the tool are put away). */
    snapshot: (): Record<string, SketchParams> => Object.fromEntries(defs),
    restore(snap: Record<string, SketchParams>): void { defs.clear(); for (const [k, v] of Object.entries(snap)) defs.set(k, v); sel.clear(); flash = {}; },
    /** A press on a part with no tool on: it may be dragged (true: the press is taken; a press that goes nowhere is a click, said at `grabEnd`). */
    grab(x: number, y: number, shift: boolean): boolean {
      if (tool) return false;
      const c = here(x, y); if (!c) return false;
      const s = solOf(c.p), h = hitAt(c.p, s, c.q, c.tol); if (!h) return false;
      const ring = h.kind === "curve" && h.of === "circle" ? (c.p.circles ?? []).find((q) => q.id === h.id) : null; // (a circle's edge: its radius follows the pointer; its centre moves it whole)
      const pins = ring ? [] : pinsOf(c.p, h.id); if (!pins.length && !ring) return false;
      drag = { key: c.key, def0: c.p, pins, start: Object.fromEntries(pins.map((id) => [id, s.points[id]!])), q0: c.q, x0: x, y0: y, moved: false, shift, id: h.id, join: null, snapAt: null, edge: ring ? { circle: ring.id, centre: ring.c } : null, help: null };
      return true;
    },
    grabMove(x: number, y: number): void {
      if (!drag) return;
      const c = here(x, y); if (!c) return;
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < 4) return; // (a press that has not gone anywhere yet is still a click)
      drag.moved = true; drag.join = null; drag.snapAt = null; drag.help = null;
      const sol0 = solOf(drag.def0), S0 = sysOf(drag.def0);
      if (drag.edge) { // a circle's edge: the place the helpers give the edge (a tangent, an equal radius) sets the radius
        const centre = sol0.points[drag.edge.centre]!, out = without(S0, [drag.edge.circle]);
        drag.help = helpersAt(out, { shape: "circle", centre, startId: drag.edge.centre }, c.q, c.mm, settings.helpers);
        const at = drag.help.acted.length ? drag.help.at : c.q, r = dragRadius(drag.def0, drag.edge.circle, Math.max(1e-3, Math.hypot(at[0] - centre[0], at[1] - centre[1])));
                if (!r) return;
        defs.set(drag.key, r.params); flash = r.held.length ? { refused: r.held } : {}; flashUntil = performance.now() + 400; if (r.held.length) say("Held back by the constraints shown in red", 600); return;
      }
      let d: P2 = [c.q[0] - drag.q0[0], c.q[1] - drag.q0[1]];
      const lone = drag.pins.length === 1 && drag.id === drag.pins[0], whole = !lone && drag.pins.length === 2 && !drag.pins.includes(drag.id), piece = lone || whole ? pieceOf(drag.def0, sol0, drag.id) : null; // (a whole line, or a circle by its centre, moves as one piece)
      const hint = (at0: Pt, want: Pt, look: { free: Free; out: string[] }) => { // the helpers place what is dragged, as when it was drawn: they place, they never constrain
        const help = helpersAt(without(S0, look.out), look.free, want, c.mm, settings.helpers);
        drag!.help = help.acted.length || help.holds.length ? help : null;
        if (help.acted.length) d = [help.at[0] - at0[0], help.at[1] - at0[1]];
      };
      if (lone) { // one point: it sticks to another point or a curve near it, else the helpers place it (an alignment, a tangent for the end of a line, on a line)
        const at0 = drag.start[drag.pins[0]!]!, want: Pt = [at0[0] + d[0], at0[1] + d[1]], j = joinFor(drag.def0, sol0, drag.id, want, c.tol);
        if (j) { drag.join = { id: j.id, kind: j.kind }; drag.snapAt = j.at; d = [j.at[0] - at0[0], j.at[1] - at0[1]]; }
        else hint(at0, want, piece ?? freeOfDrag(drag.def0, sol0, drag.id));
      } else if (piece) hint(piece.ref, [piece.ref[0] + d[0], piece.ref[1] + d[1]], piece);
      const pins = Object.fromEntries(drag.pins.map((id) => [id, [drag!.start[id]![0] + d[0], drag!.start[id]![1] + d[1]] as [number, number]]));
      const r = dragTo(drag.def0, pins); if (!r) return; // (a place that cannot be solved: the part stays where it was last)
      defs.set(drag.key, r.params);
      flash = r.held.length ? { refused: r.held } : {}; flashUntil = performance.now() + 400; if (r.held.length) say("Held back by the constraints shown in red", 600);
    },
    grabEnd(): void {
      const g = drag; drag = null; if (!g) return;
      if (!g.moved) { // it was a click on the part: it is picked
        const was = selected(g.key); sel.setSketch(g.key, g.shift ? (was.includes(g.id) ? was.filter((q) => q !== g.id) : [...was, g.id]) : [g.id]); return;
      }
      const next = defs.get(g.key) ?? g.def0; // (a point let go on another point or a curve lands there; no constraint is made by it)
      defs.set(g.key, g.def0); // (the history takes the whole move as one change, from where it began)
      set(g.key, next, "Drag"); sel.setSketch(g.key, [g.id]); flash = {};
    },
    /** What to draw: every sketch on every plane (what is selected in teal), what the tool would make, the part a trim would take, and the place the pointer is at. */
    lines(pointer: { x: number; y: number } | null): DrawLine[] {
      if (pointer) lastPointer = pointer;
      const { all } = host.planes(), out: DrawLine[] = [];
      for (const k of [...defs.keys()]) if (!all.has(k)) defs.delete(k); // (the plane is gone, and its sketch)
      for (const [k, p] of defs) {
        const f = all.get(k)!, s = solOf(p), chosen = new Set(selected(k)), seg = segsOf(p, s.points, s.radii);
        for (const q of seg) out.push({ kind: chosen.has(q.name) ? "selected" : "done", pts: polyline(q).map((z) => to3(f, z)) });
        if (chosen.size) { const S = sysOf(p); for (const b of bubblesOn(S, [...chosen])) { const m = b.relation === "angle" ? angleMarkAt(f, S, b.parts) : null; if (m) out.push({ kind: "note", pts: m.arc.map((z) => to3(f, z)) }); } }
        for (const x of p.points) { const at = chosen.has(x.id) ? s.points[x.id] : null; if (at) out.push({ kind: "ball", pts: [to3(f, at)], r: mmPerPx(f, at) * settings.sketch.ballPx }); } // (the old app marks no point until it is picked, then a teal ball)
      }
      if (drag?.help) { // what the helpers say of where the dragged point or edge is: the same drawing as when the figure was drawn (orange ties, dashed guides)
        const f = all.get(drag.key), p = defs.get(drag.key);
        if (f && p) {
          const sol = solOf(p), h = drag.help, at = h.at, shown = helpShown(h, (part) => { const g = segsOf(p, sol.points, sol.radii).find((x) => x.name === part); return g ? polyline(g) : null; }, (id) => sol.points[id] ?? null);
          for (const l of shown) out.push({ kind: l.kind, pts: l.pts.map((z) => to3(f, z)), ...(l.kind === "guide" ? { dash: dashAt(f, at) } : {}), ...(l.kind === "tieBall" ? { r: mmPerPx(f, l.pts[0]!) * settings.sketch.ballPx } : {}) });
        }
      }
      if (drag?.snapAt) { const f = all.get(drag.key); if (f) { const arm = mmPerPx(f, drag.snapAt) * settings.sketch.crossPx * 1.4, w = to3(f, drag.snapAt); out.push({ kind: "cursor", pts: [add(w, scale(f.u, -arm)), add(w, scale(f.u, arm))] }, { kind: "cursor", pts: [add(w, scale(vOf(f), -arm)), add(w, scale(vOf(f), arm))] }); } }
      const c = pointer && tool ? here(pointer.x, pointer.y) : null;
      if (c && tool) {
        const s = solOf(c.p);
        if (tool.kind === "trim") {
          const t = trimHere(c);
          if (t?.out) out.push({ kind: "cut", pts: t.out.span.map((z) => to3(c.f, z)) });
        } else {
          const pl = placed(c, s), at = posOf(s, pl.ref);
          for (const l of toolPreview(tool, s, at)) out.push({ kind: l.kind, pts: l.pts.map((z) => to3(c.f, z)) });
          const shown = pl.help ? helpShown(pl.help, (part) => { const g = segsOf(c.p, s.points, s.radii).find((x) => x.name === part); return g ? polyline(g) : null; }, (id) => s.points[id] ?? null) : [];
          for (const l of shown) out.push({ kind: l.kind, pts: l.pts.map((z) => to3(c.f, z)), ...(l.kind === "guide" ? { dash: dashAt(c.f, at) } : {}), ...(l.kind === "tieBall" ? { r: mmPerPx(c.f, l.pts[0]!) * settings.sketch.ballPx } : {}) });
          const arm = mmPerPx(c.f, at) * settings.sketch.crossPx, w = to3(c.f, at);
          out.push({ kind: "cursor", pts: [add(w, scale(c.f.u, -arm)), add(w, scale(c.f.u, arm))] }, { kind: "cursor", pts: [add(w, scale(vOf(c.f), -arm)), add(w, scale(vOf(c.f), arm))] });
        }
      }
      return out;
    },
    /** The marks standing on the parts (`dec_marks_on_things`): what is selected shows its constraints (locked) and what is true of it and near (offered); the parts just made show their offers for a while and fade; a refusal shows what held it back, always; placed on the page. */
    marks(now: number): PlacedMark[] {
      const c = current(); if (!c) { ownId = null; return []; }
      const cam = host.view(), at3 = (m: Mark): PlacedMark => { const q = project(cam.cam, to3(c.f, m.at), cam.w, cam.h); return { mark: m, x: q.x, y: q.y }; };
      if (tool && tool.pts.length) { // a figure under way: its numbers stand on it, as they are measured (open) or typed (closed); they take digits from the keys and are not clicked
        ownId = null; if (tool.kind === "trim" || !FIELDS[tool.kind].length || !lastPointer) return [];
        const s = solOf(c.p), S = sysOf(c.p), hereNow = here(lastPointer.x, lastPointer.y), kind = tool.kind; if (!hereNow) return [];
        const pl = placed(hereNow, s), to = posOf(s, pl.ref), from = tool.pts[0] ? posOf(s, tool.pts[0]) : to, live = FIELDS[kind].map((f) => measureAt(S, pl.free, to, f.kind, f.parts));
        return chipFields(kind, tool.typed, tool.field, live).map((f) => {
          const where: P2 = kind === "rect" ? (f.label === "Width" ? [(from[0] + to[0]) / 2, from[1]] : [to[0], (from[1] + to[1]) / 2]) : [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]; // (a rectangle's width on its bottom side, its height on the side at the pointer)
          return at3({ id: `field:${f.label}`, kind: "dimension", relation: "length", icon: "dimension", at: where, text: f.text, tone: "rest", title: f.label, parts: [], locked: f.typed, readonly: true, active: f.active, state: f.typed ? "locked" : "offer", alpha: 1, ...(f.label === "Diameter" ? { symbol: "Ø" } : {}) });
        });
      }
      const S = sysOf(c.p), ids = selected(c.key), has = (id: string) => S.points.some((x) => x.id === id) || S.lines.some((x) => x.id === id) || S.circles.some((x) => x.id === id);
      if (ids.length) recent = null; // (once the person has picked something, the offers for what was just made are over)
      const fresh = recent && recent.key === c.key ? { ids: recent.ids.filter(has), until: recent.until } : null;
      const list = marksFor(S, ids, { flash, recent: fresh, now }), chosen = [...ids].sort().join();
      ownId = list.find((m) => m.kind === "dimension" && [...m.parts].sort().join() === chosen)?.id ?? null; // (the number a digit goes to)
      return list.map(at3);
    },
    /** Each picture: a refusal's red goes after its time. */
    frame(now: number): void { if (now > flashUntil) flash = {}; },
    /** The closed parts of every drawing, to be tinted (a closed figure has a very faint fill in the old app, `in_194`): the outline and holes in each plane's axes. */
    fills(): { frame: { origin: V3; u: V3; v: V3 }; loops: [number, number][][] }[] {
      const { all } = host.planes(), out: { frame: { origin: V3; u: V3; v: V3 }; loops: [number, number][][] }[] = [];
      for (const [k, p] of defs) {
        const f = all.get(k); if (!f) continue;
        let loops = fillCache.get(p);
        if (!loops) { try { const sol = solOf(p), found = regions(segsOf(p, sol.points, sol.radii)); loops = found.profiles.map((q) => [loopPoints(q.outer), ...q.holes.map(loopPoints)] as [number, number][][]); } catch { loops = []; } fillCache.set(p, loops); }
        for (const l of loops) out.push({ frame: { origin: f.origin, u: f.u, v: vOf(f) }, loops: l });
      }
      return out;
    },
    /** The region of the drawing on the plane that is on under the pointer, with the sketch and the plane it is of (what an extrude is made from); null: none. */
    regionAt(x: number, y: number): { key: string; frame: Frame; def: SketchParams; region: Region } | null {
      const c = here(x, y); if (!c) return null;
      const region = regionAt(c.p, c.q); return region ? { key: c.key, frame: c.f, def: c.p, region } : null;
    },
    /** Whether any plane has something drawn on it (what the Extrude tool needs). */
    hasDrawing: (): boolean => [...defs.values()].some((p) => (p.lines?.length ?? 0) + (p.circles?.length ?? 0) + (p.arcs?.length ?? 0) > 0),
    /** The sketch of a plane, as the definition (for the extrude). */
    sketchOf: (key: string): SketchParams | null => defs.get(key) ?? null,
    /** what the marks' buttons do */
    handlers,
    /** the offers for what was just made are over (another tool, such as Extrude, is taking the clicks) */
    dismissOffers(): void { recent = null; },
    /** a press of the helper bar by its id (`delete`, `clear`, `rel:<relation>`): for the dev checks */
    press: act,
    debug: () => ({ drag: drag ? { id: drag.id, moved: drag.moved, edge: drag.edge, acted: drag.help?.acted.map((x) => x.relation) ?? null } : null, tool: tool ? { ...tool } : null, sketches: [...defs].map(([k, v]) => [k, v] as const), selection: (() => { const k = sel.get(); return k?.kind === "sketch" ? { key: k.key, ids: k.ids } : { key: "", ids: [] }; })() }),
  };
  clickAt = (x, y, count) => api.click(x, y, count);
  return api;
}
