// The sketching controller (`in_1564`): a sketch is the engine's own definition (points, lines, circles, constraints: `SketchParams`), one for each plane, drawn, selected, dimensioned and trimmed here, and solved by the engine's solver
// at every edit (`interaction/drawing.ts`; no kernel). It turns the pointer into a place in the plane and the engine's answers into what the page shows: the lines, the bubbles of what is selected (`bubbledraw.ts`), a sentence.
// The tool that is on: Line, Rectangle, Circle (the figure goes on being made until the tool is put away), or Trim (a click on a piece of a line, arc or circle takes off the part between the places where others cross it).
import { viewHeight, forwardDepth, project, type Cam } from "./camera.ts";
import { onPlane, to2, to3, type P2, type ToolKind } from "./sketch.ts";
import type { Frame } from "./planes.ts";
import { vOf } from "./planes.ts";
import { settings } from "./settings.ts";
import { add, scale, type V3 } from "./vec.ts";
import type { SketchParams } from "./engine/sketch.ts";
import { solveDefinition, segsOf } from "./engine/definition.ts";
import { pointOnSeg, type Pt } from "./engine/region.ts";
import { trimAt } from "./engine/trim.ts";
import type { Relation } from "./engine/solver.ts";
import { addCircle, addLine, addRect, bake, constrain, emptySketch, hitAt, keep, posOf, refOf, removeParts, retype, unconstrain, viewSystem, type Ref, type Sol } from "./interaction/drawing.ts";
import { bubblesOn, selectionAnchor, type Flash } from "./interaction/bubbles.ts";
import { barFor } from "./interaction/helperbar.ts";
import { createHelperBar } from "./helperbardraw.ts";
import { createBubbleLayer, type Placed } from "./bubbledraw.ts";
import { regionAt, type Region } from "./interaction/extrude.ts";

export interface SketchHost {
  view(): { cam: Cam; w: number; h: number };
  /** Every plane there is, by name (the sketches of a plane that is gone are let go), and the one that is on. */
  planes(): { all: Map<string, Frame>; on: string; step: number };
  ray(x: number, y: number): { o: V3; d: V3 };
}
export interface DrawLine { pts: V3[]; kind: "done" | "selected" | "preview" | "cursor" | "cut" }
type Tool = { kind: ToolKind; pts: Ref[] };

export function createSketch(host: SketchHost, page: HTMLElement, on?: (label: string, merge?: string) => void) {
  const defs = new Map<string, SketchParams>(), sols = new WeakMap<SketchParams, Sol>();
  let tool: Tool | null = null, selection: { key: string; ids: string[] } = { key: "", ids: [] }, flash: Flash = {}, flashUntil = 0, message = "", messageUntil = 0;
  const say = (text: string, ms = 4000) => { message = text; messageUntil = performance.now() + ms; };
  const solOf = (p: SketchParams): Sol => { let s = sols.get(p); if (!s) { const r = solveDefinition(p); s = { points: r.points, radii: r.radii }; sols.set(p, s); } return s; };
  const current = () => { const { all, on } = host.planes(); const f = all.get(on); return f ? { key: on, f, p: defs.get(on) ?? emptySketch() } : null; };
  const selected = (key: string) => (selection.key === key ? selection.ids : []);
  /** a pixel's worth of the plane in mm, where the pointer is */
  const mmPerPx = (f: Frame, q: P2) => { const { cam, h } = host.view(); return viewHeight(cam, Math.max(forwardDepth(cam, to3(f, q)), 1e-3)) / h; };
  const here = (x: number, y: number) => {
    const c = current(); if (!c) return null;
    const r = host.ray(x, y), q = onPlane(c.f, r.o, r.d); if (!q) return null;
    return { ...c, q: to2(c.f, q), tol: mmPerPx(c.f, to2(c.f, q)) * settings.sketch.snapPx };
  };
  /** a change of a sketch: kept, and said to whoever keeps the history (`label`: what it was; `merge`: changes with the same key are one, a number typed again and again) */
  const set = (key: string, p: SketchParams, label: string, merge?: string) => { defs.set(key, p); on?.(label, merge); };
  const fail = (why: string, victims: string[]) => { say(why); flash = { refused: victims }; flashUntil = performance.now() + 1800; };

  // ---- a part dragged: the solver follows the pointer with the part pinned where it goes (soft: it goes as near as the constraints allow); a point let go on another point or on a curve joins it
  type Drag = { key: string; def0: SketchParams; pins: string[]; start: Record<string, [number, number]>; q0: P2; x0: number; y0: number; moved: boolean; shift: boolean; id: string; join: { id: string; kind: "point" | "curve" } | null; snapAt: P2 | null };
  let drag: Drag | null = null;
  const pinsOf = (p: SketchParams, id: string): string[] => {
    if (p.points.some((q) => q.id === id)) return [id];
    const l = (p.lines ?? []).find((q) => q.id === id); if (l) return [l.a, l.b];
    const c = (p.circles ?? []).find((q) => q.id === id); if (c) return [c.c];
    const a = (p.arcs ?? []).find((q) => q.id === id); if (a) return [a.c, a.a, a.b];
    return [];
  };
  /** where a dragged point would join something: another point within reach, else a curve it is not part of */
  const joinFor = (p: SketchParams, s: Sol, id: string, q: P2, tol: number): { id: string; kind: "point" | "curve"; at: P2 } | null => {
    let best: { id: string; kind: "point" | "curve"; at: P2 } | null = null, bd = tol;
    for (const x of p.points) { if (x.id === id) continue; const at = s.points[x.id]; if (!at) continue; const d = Math.hypot(q[0] - at[0], q[1] - at[1]); if (d < bd) { bd = d; best = { id: x.id, kind: "point", at }; } }
    if (best) return best;
    const mine = new Set([...(p.lines ?? []).filter((l) => l.a === id || l.b === id).map((l) => l.id), ...(p.arcs ?? []).filter((a) => a.a === id || a.b === id || a.c === id).map((a) => a.id), ...(p.circles ?? []).filter((c) => c.c === id).map((c) => c.id)]);
    const h = hitAt({ ...p, lines: (p.lines ?? []).filter((l) => !mine.has(l.id)), arcs: (p.arcs ?? []).filter((a) => !mine.has(a.id)), circles: (p.circles ?? []).filter((c) => !mine.has(c.id)), points: [] }, s, q, tol);
    return h && h.kind === "curve" ? { id: h.id, kind: "curve", at: h.at } : null;
  };

  const layer = createBubbleLayer(page, {
    set(id, value) {
      const c = current(); if (!c) return;
      const r = retype(c.p, id, value);
      if (r.ok) { set(c.key, r.params, "Number", `n:${id}`); flash = {}; } else fail(r.why, r.victims);
    },
    remove(id) {
      const c = current(); if (!c) return;
      const r = unconstrain(c.p, id); if (r.ok) set(c.key, r.params, "Delete constraint"); else fail(r.why, r.victims);
    },
  });

  /** a press on the helper bar: the selection is taken away or put away, or a relation is put on it */
  const act = (id: string): void => {
    const c = current(); if (!c) return;
    if (id === "clear") selection = { key: "", ids: [] };
    else if (id === "delete") { const sel = selected(c.key); if (sel.length) { set(c.key, removeParts(c.p, sel), "Delete"); selection = { key: c.key, ids: [] }; } }
    else if (id.startsWith("rel:")) {
      const r = constrain(c.p, solOf(c.p), selected(c.key), id.slice(4) as Relation | "dimension");
      if (r.ok) { set(c.key, r.params, "Constraint"); flash = { applied: [r.added] }; flashUntil = performance.now() + 900; } else fail(r.why, r.victims);
    }
  };
  const bar = createHelperBar(page, act);

  /** a figure made with a click: kept if the engine accepts it */
  const commit = (key: string, next: SketchParams | null, label: string) => {
    if (!next) return;
    const k = keep(next);
    if (k.ok) set(key, k.params, label); else fail(k.why, k.victims);
  };
  type Trimmed = { id: string; out: ReturnType<typeof trimAt>; err?: undefined } | { id: string; err: string; out?: undefined };
  const trimHere = (c: NonNullable<ReturnType<typeof here>>): Trimmed | null => {
    const s = solOf(c.p), h = hitAt(c.p, s, c.q, c.tol);
    if (!h || h.kind !== "curve") return null;
    try { return { id: h.id, out: trimAt(c.p, h.id, h.at) }; } catch (x) { return { id: h.id, err: (x as Error).message }; }
  };
  const polyline = (s: ReturnType<typeof segsOf>[number]): Pt[] => s.kind === "line" ? [s.a, s.b] : Array.from({ length: 65 }, (_, k) => pointOnSeg(s, (k / 64) * s.sweep));

  return {
    active: () => tool !== null,
    tool: (): ToolKind | null => tool?.kind ?? null,
    start(kind: ToolKind) { tool = { kind, pts: [] }; selection = { key: "", ids: [] }; },
    /** Right click or Esc: the figure under way is given up; with none, the tool is put away. Returns whether there was a tool. */
    stop(): boolean {
      if (!tool) return false;
      if (tool.pts.length) tool = { ...tool, pts: [] }; else tool = null;
      return true;
    },
    /** A click. With a tool on it is the tool's (a double click ends a line's chain); with none, it selects (Shift adds). Returns whether it was used. */
    click(x: number, y: number, count: number, shift = false): boolean {
      const c = here(x, y);
      if (!tool) {
        if (!c) return false;
        const h = hitAt(c.p, solOf(c.p), c.q, c.tol);
        if (!h) { const had = selected(c.key).length > 0; selection = { key: c.key, ids: [] }; return had; }
        const was = selected(c.key), id = h.id; selection = { key: c.key, ids: shift ? (was.includes(id) ? was.filter((q) => q !== id) : [...was, id]) : [id] };
        return true;
      }
      if (count >= 2 && tool.kind === "line") { tool = { ...tool, pts: [] }; return true; }
      if (!c) return true;
      if (tool.kind === "trim") {
        const t = trimHere(c);
        if (!t) say("Click a line, an arc or a circle to trim it");
        else if (t.err !== undefined) fail(t.err, []);
        else { set(c.key, t.out.params, "Trim"); flash = {}; say(t.out.dropped.length ? `Trimmed. Let go: ${t.out.dropped.map((d) => `${d.kind} (${d.why})`).join("; ")}` : "Trimmed"); }
        return true;
      }
      const s = solOf(c.p), r = refOf(c.p, s, c.q, c.tol, host.planes().step), a = tool.pts[0];
      if (!a) { tool = { ...tool, pts: [r] }; return true; }
      if (tool.kind === "line") { commit(c.key, addLine(c.p, s, a, r), "Line"); tool = { ...tool, pts: [r] }; }
      else if (tool.kind === "rect") { commit(c.key, addRect(c.p, s, a, r), "Rectangle"); tool = { ...tool, pts: [] }; }
      else { commit(c.key, addCircle(c.p, s, a, posOf(s, r)), "Circle"); tool = { ...tool, pts: [] }; }
      // a line goes on from where it ended: the end is now a point of the sketch
      if (tool.kind === "line" && tool.pts[0] && !("id" in tool.pts[0])) { const q = defs.get(c.key)!, s2 = solOf(q), h = hitAt(q, s2, posOf(s, r), 1e-6); if (h?.kind === "point") tool = { ...tool, pts: [{ id: h.id }] }; }
      return true;
    },
    /** Keys of the sketch: Delete takes the selected parts away, D puts a number on them (what they measure now, to type over). Returns whether the key was used. */
    key(code: string): boolean {
      const c = current(); if (!c || tool) return false;
      const sel = selected(c.key);
      if (code === "Delete" || code === "Backspace") { if (!sel.length) return false; set(c.key, removeParts(c.p, sel), "Delete"); selection = { key: c.key, ids: [] }; return true; }
      if (code === "KeyD") {
        const r = constrain(c.p, solOf(c.p), sel, "dimension");
        if (r.ok) { set(c.key, r.params, "Dimension"); flash = { applied: [r.added] }; flashUntil = performance.now() + 900; } else fail(r.why, r.victims);
        return true;
      }
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
    restore(snap: Record<string, SketchParams>): void { defs.clear(); for (const [k, v] of Object.entries(snap)) defs.set(k, v); selection = { key: "", ids: [] }; flash = {}; },
    /** A press on a part with no tool on: it may be dragged (true: the press is taken; a press that goes nowhere is a click, said at `grabEnd`). */
    grab(x: number, y: number, shift: boolean): boolean {
      if (tool) return false;
      const c = here(x, y); if (!c) return false;
      const s = solOf(c.p), h = hitAt(c.p, s, c.q, c.tol); if (!h) return false;
      const pins = pinsOf(c.p, h.id); if (!pins.length) return false;
      drag = { key: c.key, def0: c.p, pins, start: Object.fromEntries(pins.map((id) => [id, s.points[id]!])), q0: c.q, x0: x, y0: y, moved: false, shift, id: h.id, join: null, snapAt: null };
      return true;
    },
    grabMove(x: number, y: number): void {
      if (!drag) return;
      const c = here(x, y); if (!c) return;
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < 4) return; // (a press that has not gone anywhere yet is still a click)
      drag.moved = true;
      let d: P2 = [c.q[0] - drag.q0[0], c.q[1] - drag.q0[1]];
      drag.join = null; drag.snapAt = null;
      if (drag.pins.length === 1 && drag.id === drag.pins[0]) { // one point: it sticks to another point or a curve near it
        const at0 = drag.start[drag.pins[0]!]!, j = joinFor(drag.def0, solOf(drag.def0), drag.id, [at0[0] + d[0], at0[1] + d[1]], c.tol);
        if (j) { drag.join = { id: j.id, kind: j.kind }; drag.snapAt = j.at; d = [j.at[0] - at0[0], j.at[1] - at0[1]]; }
      }
      const pins = Object.fromEntries(drag.pins.map((id) => [id, [drag!.start[id]![0] + d[0], drag!.start[id]![1] + d[1]] as [number, number]]));
      try {
        const r = solveDefinition(drag.def0, { pins });
        defs.set(drag.key, bake(drag.def0, { points: r.points, radii: r.radii }));
        const held = r.result.holds ?? []; flash = held.length ? { refused: held } : {}; flashUntil = performance.now() + 400; if (held.length) say("Held back by the constraints shown in red", 600);
      } catch { /* a place that cannot be solved: the part stays where it was last */ }
    },
    grabEnd(): void {
      const g = drag; drag = null; if (!g) return;
      if (!g.moved) { // it was a click on the part: it is picked
        const was = selected(g.key); selection = { key: g.key, ids: g.shift ? (was.includes(g.id) ? was.filter((q) => q !== g.id) : [...was, g.id]) : [g.id] }; return;
      }
      let next = defs.get(g.key) ?? g.def0, joined = false;
      if (g.join) { const r = constrain(next, solOf(next), [g.id, g.join.id], g.join.kind === "point" ? "coincident" : (next.lines ?? []).some((l) => l.id === g.join!.id) ? "pointOnLine" : "pointOnCircle"); if (r.ok) { next = r.params; joined = true; } }
      defs.set(g.key, g.def0); // (the history takes the whole move as one change, from where it began)
      set(g.key, next, joined ? "Drag and join" : "Drag"); selection = { key: g.key, ids: [g.id] }; flash = {};
    },
    clearSelection(): boolean { const had = selection.ids.length > 0; selection = { key: "", ids: [] }; return had; },
    /** What to draw: every sketch on every plane (what is selected in teal), what the tool would make, the part a trim would take, and the place the pointer is at. */
    lines(pointer: { x: number; y: number } | null): DrawLine[] {
      const { all } = host.planes(), out: DrawLine[] = [];
      for (const k of [...defs.keys()]) if (!all.has(k)) defs.delete(k); // (the plane is gone, and its sketch)
      for (const [k, p] of defs) {
        const f = all.get(k)!, s = solOf(p), sel = new Set(selected(k)), seg = segsOf(p, s.points, s.radii), arm = 3;
        for (const q of seg) out.push({ kind: sel.has(q.name) ? "selected" : "done", pts: polyline(q).map((z) => to3(f, z)) });
        for (const x of p.points) { const at = s.points[x.id]; if (!at) continue; const a = mmPerPx(f, at) * (sel.has(x.id) ? 5 : arm); out.push({ kind: sel.has(x.id) ? "selected" : "done", pts: [to3(f, [at[0] - a, at[1]]), to3(f, [at[0] + a, at[1]])] }, { kind: sel.has(x.id) ? "selected" : "done", pts: [to3(f, [at[0], at[1] - a]), to3(f, [at[0], at[1] + a])] }); }
      }
      if (drag?.snapAt) { const f = all.get(drag.key); if (f) { const arm = mmPerPx(f, drag.snapAt) * settings.sketch.crossPx * 1.4, w = to3(f, drag.snapAt); out.push({ kind: "cursor", pts: [add(w, scale(f.u, -arm)), add(w, scale(f.u, arm))] }, { kind: "cursor", pts: [add(w, scale(vOf(f), -arm)), add(w, scale(vOf(f), arm))] }); } }
      const c = pointer && tool ? here(pointer.x, pointer.y) : null;
      if (c && tool) {
        const s = solOf(c.p);
        if (tool.kind === "trim") {
          const t = trimHere(c);
          if (t?.out) out.push({ kind: "cut", pts: t.out.span.map((z) => to3(c.f, z)) });
        } else {
          const r = refOf(c.p, s, c.q, c.tol, host.planes().step), at = posOf(s, r), a = tool.pts[0], A = a ? posOf(s, a) : null;
          if (A && tool.kind === "line") out.push({ kind: "preview", pts: [to3(c.f, A), to3(c.f, at)] });
          else if (A && tool.kind === "rect") out.push({ kind: "preview", pts: [A, [at[0], A[1]], at, [A[0], at[1]], A].map((z) => to3(c.f, z as P2)) });
          else if (A && tool.kind === "circle") { const rad = Math.hypot(at[0] - A[0], at[1] - A[1]); out.push({ kind: "preview", pts: Array.from({ length: 65 }, (_, k) => to3(c.f, [A[0] + rad * Math.cos((k / 64) * 2 * Math.PI), A[1] + rad * Math.sin((k / 64) * 2 * Math.PI)])) }); }
          const arm = mmPerPx(c.f, at) * settings.sketch.crossPx, w = to3(c.f, at);
          out.push({ kind: "cursor", pts: [add(w, scale(c.f.u, -arm)), add(w, scale(c.f.u, arm))] }, { kind: "cursor", pts: [add(w, scale(vOf(c.f), -arm)), add(w, scale(vOf(c.f), arm))] });
        }
      }
      return out;
    },
    /** Each picture: the bubbles of what is selected, on the page, and the sentence (empty when it has gone). */
    frame(now: number): { message: string } {
      if (now > flashUntil) flash = {};
      if (now > messageUntil) message = "";
      const c = current(), cam = host.view();
      if (!c) { layer.show([], { lines: [], dots: [] }); bar.show(null, null, cam.w, cam.h); return { message }; }
      const s = solOf(c.p), S = viewSystem(c.p, s), px = (p: P2) => { const q = project(cam.cam, to3(c.f, p), cam.w, cam.h); return [q.x, q.y] as [number, number]; };
      // the helper bar beside what is selected (not while a tool is on or a number is being typed); the bubbles keep clear of it
      const sel = selected(c.key), where = !tool && !layer.editing() ? selectionAnchor(S, sel) : null;
      const box = bar.show(where ? barFor(S, sel) : null, where ? px(where) : null, cam.w, cam.h);
      const items: Placed[] = bubblesOn(S, selected(c.key), flash).map((bubble) => { const [x, y] = px(bubble.at); return { bubble, x, y }; });
      layer.show(items, { lines: c.p.lines?.map((l) => [px(s.points[l.a]!), px(s.points[l.b]!)] as [[number, number], [number, number]]) ?? [], dots: c.p.points.map((q) => px(s.points[q.id]!)), ...(box ? { rects: [box] } : {}) });
      return { message };
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
    editing: (): boolean => layer.editing(),
    /** a press of the helper bar by its id (`delete`, `clear`, `rel:<relation>`): for the dev checks */
    press: act,
    debug: () => ({ tool: tool ? { ...tool } : null, sketches: [...defs].map(([k, v]) => [k, v] as const), selection, message }),
  };
}
