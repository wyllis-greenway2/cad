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
import { addCircle, addLine, addRect, constrain, emptySketch, hitAt, keep, posOf, refOf, removeParts, retype, unconstrain, viewSystem, type Ref, type Sol } from "./interaction/drawing.ts";
import { bubblesOn, selectionAnchor, type Flash } from "./interaction/bubbles.ts";
import { barFor } from "./interaction/helperbar.ts";
import { createHelperBar } from "./helperbardraw.ts";
import { createBubbleLayer, type Placed } from "./bubbledraw.ts";

export interface SketchHost {
  view(): { cam: Cam; w: number; h: number };
  /** Every plane there is, by name (the sketches of a plane that is gone are let go), and the one that is on. */
  planes(): { all: Map<string, Frame>; on: string; step: number };
  ray(x: number, y: number): { o: V3; d: V3 };
}
export interface DrawLine { pts: V3[]; kind: "done" | "selected" | "preview" | "cursor" | "cut" }
type Tool = { kind: ToolKind; pts: Ref[] };

export function createSketch(host: SketchHost, page: HTMLElement) {
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
  const set = (key: string, p: SketchParams) => { defs.set(key, p); };
  const fail = (why: string, victims: string[]) => { say(why); flash = { refused: victims }; flashUntil = performance.now() + 1800; };

  const layer = createBubbleLayer(page, {
    set(id, value) {
      const c = current(); if (!c) return;
      const r = retype(c.p, id, value);
      if (r.ok) { set(c.key, r.params); flash = {}; } else fail(r.why, r.victims);
    },
    remove(id) {
      const c = current(); if (!c) return;
      const r = unconstrain(c.p, id); if (r.ok) set(c.key, r.params); else fail(r.why, r.victims);
    },
  });

  /** a press on the helper bar: the selection is taken away or put away, or a relation is put on it */
  const act = (id: string): void => {
    const c = current(); if (!c) return;
    if (id === "clear") selection = { key: "", ids: [] };
    else if (id === "delete") { const sel = selected(c.key); if (sel.length) { set(c.key, removeParts(c.p, sel)); selection = { key: c.key, ids: [] }; } }
    else if (id.startsWith("rel:")) {
      const r = constrain(c.p, solOf(c.p), selected(c.key), id.slice(4) as Relation | "dimension");
      if (r.ok) { set(c.key, r.params); flash = { applied: [r.added] }; flashUntil = performance.now() + 900; } else fail(r.why, r.victims);
    }
  };
  const bar = createHelperBar(page, act);

  /** a figure made with a click: kept if the engine accepts it */
  const commit = (key: string, next: SketchParams | null, p: SketchParams) => {
    if (!next) return;
    const k = keep(next);
    if (k.ok) set(key, k.params); else { set(key, p); fail(k.why, k.victims); }
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
        else { set(c.key, t.out.params); flash = {}; say(t.out.dropped.length ? `Trimmed. Let go: ${t.out.dropped.map((d) => `${d.kind} (${d.why})`).join("; ")}` : "Trimmed"); }
        return true;
      }
      const s = solOf(c.p), r = refOf(c.p, s, c.q, c.tol, host.planes().step), a = tool.pts[0];
      if (!a) { tool = { ...tool, pts: [r] }; return true; }
      if (tool.kind === "line") { commit(c.key, addLine(c.p, s, a, r), c.p); tool = { ...tool, pts: [r] }; }
      else if (tool.kind === "rect") { commit(c.key, addRect(c.p, s, a, r), c.p); tool = { ...tool, pts: [] }; }
      else { commit(c.key, addCircle(c.p, s, a, posOf(s, r)), c.p); tool = { ...tool, pts: [] }; }
      // a line goes on from where it ended: the end is now a point of the sketch
      if (tool.kind === "line" && tool.pts[0] && !("id" in tool.pts[0])) { const q = defs.get(c.key)!, s2 = solOf(q), h = hitAt(q, s2, posOf(s, r), 1e-6); if (h?.kind === "point") tool = { ...tool, pts: [{ id: h.id }] }; }
      return true;
    },
    /** Keys of the sketch: Delete takes the selected parts away, D puts a number on them (what they measure now, to type over). Returns whether the key was used. */
    key(code: string): boolean {
      const c = current(); if (!c || tool) return false;
      const sel = selected(c.key);
      if (code === "Delete" || code === "Backspace") { if (!sel.length) return false; set(c.key, removeParts(c.p, sel)); selection = { key: c.key, ids: [] }; return true; }
      if (code === "KeyD") {
        const r = constrain(c.p, solOf(c.p), sel, "dimension");
        if (r.ok) { set(c.key, r.params); flash = { applied: [r.added] }; flashUntil = performance.now() + 900; } else fail(r.why, r.victims);
        return true;
      }
      return false;
    },
    /** Add a relation to what is selected (the helper bar's, later); false: the sketch said no, and says why. */
    constrain(kind: Relation | "dimension"): boolean {
      const c = current(); if (!c) return false;
      const r = constrain(c.p, solOf(c.p), selected(c.key), kind);
      if (r.ok) { set(c.key, r.params); flash = { applied: [r.added] }; flashUntil = performance.now() + 900; return true; }
      fail(r.why, r.victims); return false;
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
    editing: (): boolean => layer.editing(),
    /** a press of the helper bar by its id (`delete`, `clear`, `rel:<relation>`): for the dev checks */
    press: act,
    debug: () => ({ tool: tool ? { ...tool } : null, sketches: [...defs].map(([k, v]) => [k, v] as const), selection, message }),
  };
}
