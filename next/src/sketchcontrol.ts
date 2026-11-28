// The sketching controller (`in_1564`): a sketch is the engine's own definition (points, lines, circles, constraints: `SketchParams`), one for each plane, drawn, selected, dimensioned and trimmed here, and solved by the engine's solver
// at every edit (`interaction/drawing.ts`; no kernel). It turns the pointer into a place in the plane and the engine's answers into what the page shows: the lines, the bubbles of what is selected (`bubbledraw.ts`), a sentence.
// The tool that is on: Line, Rectangle, Circle (the figure goes on being made until the tool is put away), or Trim (a click on a piece of a line, arc or circle takes off the part between the places where others cross it).
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
import { FIELDS, chipFields, freeOf, madeNames, typeKey, typedMeasures } from "./interaction/typing.ts";
import type { PlacedMark } from "./markdraw.ts";
import type { Frame } from "./planes.ts";
import { vOf } from "./planes.ts";
import { settings } from "./settings.ts";
import { to3, type P2, type ToolKind } from "./sketch.ts";
import { createCore, type DrawLine, type SketchHost } from "./sketchcore.ts";
import { createDrag } from "./sketchdrag.ts";
import { createMarks } from "./sketchmarks.ts";
import { add, scale, type V3 } from "./vec.ts";

export type { DrawLine, SketchHost } from "./sketchcore.ts";

/** the keys that type a number (and what each types) */
const TYPED: Record<string, string> = {
  ...Object.fromEntries(
    [...Array(10).keys()].flatMap((d) => [
      [`Digit${d}`, String(d)],
      [`Numpad${d}`, String(d)],
    ]),
  ),
  Period: ".",
  NumpadDecimal: ".",
  Minus: "-",
  NumpadSubtract: "-",
};

export function createSketch(host: SketchHost, on?: (label: string, merge?: string) => void) {
  const K = createCore(host, on);
  const { defs, fillCache, sel, st, say, sysOf, solOf, current, selected, dashAt, mmPerPx, here, set, fail, polyline } =
    K;
  let tool: Tool | null = null;
  /** a pixel's worth of the plane in mm, where the pointer is */
  /** where a click would put the place: on a point or curve as drawn, else drawn to the helpers' places (they place, they never constrain, `dec_hints_place_only`, `in_1579`) */
  type PlaceResult = {
    ref: Ref;
    help: Helped | null;
    free: Free;
    /** the numbers typed for the figure, as measures to hold */ measures: TypedMeasure[];
  };
  let memo: { tool: Tool | null; p: SketchParams; x: number; y: number; res: PlaceResult } | null = null; // (the same place is asked for by the preview, the chip and a click)
  const placed = (c: { p: SketchParams; q: P2; tol: number; mm: number }, s: Sol): PlaceResult => {
    if (memo && memo.tool === tool && memo.p === c.p && memo.x === c.q[0] && memo.y === c.q[1]) return memo.res;
    const res = placeOf(c, s);
    memo = { tool, p: c.p, x: c.q[0], y: c.q[1], res };
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
  /** an angle as the old app draws it: a thin arc at the corner of the two lines (about 34 px across, not past the shorter line), and where its number stands on it */
  /** a figure made with a click: kept if the engine accepts it */
  const commit = (key: string, next: SketchParams | null, label: string) => {
    if (!next) return;
    const k = keep(next);
    if (k.ok) set(key, k.params, label);
    else fail(k.why, k.victims);
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
  const M = createMarks(K, { dragged: D.dragged, fieldMarks });

  const api = {
    active: () => tool !== null,
    /** how many places of the figure under way are down (null: no drawing tool is on) */
    drawStep: (): number | null => (tool ? tool.pts.length : null),
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
      if (!tool) {
        if (!c) return false;
        const h = hitAt(c.p, solOf(c.p), c.q, c.tol);
        if (!h) {
          const had = selected(c.key).length > 0;
          if (had) sel.clear();
          return had;
        } // (only a sketch selection is the sketch's to put away: a click that hits no part goes on to the bodies)
        const was = selected(c.key),
          id = h.id;
        sel.setSketch(c.key, shift ? (was.includes(id) ? was.filter((q) => q !== id) : [...was, id]) : [id]);
        return true;
      }
      if (count >= 2 && tool.kind === "line") {
        tool = cancelFigure(tool);
        return true;
      }
      if (!c) return true;
      if (tool.kind === "trim") {
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
        return true;
      }
      const s = solOf(c.p),
        pl = placed(c, s),
        done = toolClick(tool, c.p, s, pl.ref),
        start = tool.pts[0] ? posOf(s, tool.pts[0]) : null;
      tool = done.tool;
      if (done.made?.params) {
        // the figure, with the numbers typed for it locked as dimensions, is one change
        const before = c.p,
          made = done.made,
          k = keep(made.params!),
          at = posOf(s, pl.ref);
        if (!k.ok) fail(k.why, k.victims);
        else {
          let final = k.params;
          if (pl.measures.length) {
            const names = madeNames(final, k.sol, at, start);
            let withLocks = final;
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
            const k2 = keep(withLocks);
            if (k2.ok) final = k2.params;
            else say(`The numbers typed could not be locked: ${k2.why}`);
          }
          set(c.key, final, made.label);
          // what was just made is offered what is true of it for a while (its marks), selected or not (a rectangle's four sides too)
          const p2 = defs.get(c.key)!,
            had = new Set(
              [...(before.lines ?? []), ...(before.circles ?? []), ...(before.arcs ?? [])].map((x) => x.id),
            ),
            made1 = [...(p2.lines ?? []), ...(p2.circles ?? []), ...(p2.arcs ?? [])].filter((x) => !had.has(x.id));
          st.recent = { key: c.key, ids: made1.map((x) => x.id), until: performance.now() + settings.marks.stayMs };
          sel.clear();
        }
      }
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
      st.flash = {};
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
          out.push({ kind: chosen.has(q.name) ? "selected" : "done", pts: polyline(q).map((z) => to3(f, z)) });
        const shownPts = chosen.size ? new Set(scopeOf(sysOf(p), [...chosen])) : chosen; // (what is selected shows what it is made of: a circle its centre, a line its ends, an arc its centre and ends)
        for (const x of p.points) {
          const at = shownPts.has(x.id) ? s.points[x.id] : null;
          if (at) out.push({ kind: "ball", pts: [to3(f, at)], r: mmPerPx(f, at) * settings.sketch.ballPx });
        } // (the old app marks no point until it is picked, then a teal ball)
        // a circle's and an arc's centre is always there to see, a small dot; picked, it is the teal ball above (`in_1646`)
        for (const id of new Set([...(p.circles ?? []).map((k) => k.c), ...(p.arcs ?? []).map((a) => a.c)])) {
          const at = shownPts.has(id) ? null : s.points[id];
          if (at) out.push({ kind: "centre", pts: [to3(f, at)], r: mmPerPx(f, at) * settings.sketch.ballPx * 0.55 });
        }
        // a pointed-at number is drawn on its dimension line: thin, dashed, an arrow tip at each end, the thin lines from what it measures (`in_1650`)
        if (st.lit?.dim && st.lit.key === k) {
          const dm = st.lit.dim,
            head = (tip: [number, number], from: [number, number]) => {
              const len = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1,
                ux = (tip[0] - from[0]) / len,
                uy = (tip[1] - from[1]) / len,
                h = mmPerPx(f, tip) * 8,
                w = (sg: number): [number, number] => [
                  tip[0] - h * (ux * Math.cos(0.45) - sg * uy * Math.sin(0.45)),
                  tip[1] - h * (uy * Math.cos(0.45) + sg * ux * Math.sin(0.45)),
                ];
              return { kind: "dimHead" as const, pts: [to3(f, w(1)), to3(f, tip), to3(f, w(-1))] };
            };
          out.push({ kind: "dim", pts: [to3(f, dm.a), to3(f, dm.b)], dash: dashAt(f, dm.a) });
          for (const [a, b] of dm.ext) out.push({ kind: "dimExt", pts: [to3(f, a), to3(f, b)] });
          out.push(head(dm.a, dm.b), head(dm.b, dm.a));
        }
        // a pointed-at angle is drawn in its corner: its arc, or a small square for a right angle (`in_1667`)
        if (st.lit?.corner && st.lit.key === k) {
          const cn = st.lit.corner,
            at = (t: number): P2 => [cn.centre[0] + cn.r * Math.cos(t), cn.centre[1] + cn.r * Math.sin(t)];
          if (cn.square) {
            const p0 = at(cn.from),
              p1 = at(cn.from + cn.sweep);
            out.push({
              kind: "dimArc",
              pts: [p0, [p0[0] + p1[0] - cn.centre[0], p0[1] + p1[1] - cn.centre[1]] as P2, p1].map((z) => to3(f, z)),
            });
          } else {
            const n = Math.max(6, Math.ceil(Math.abs(cn.sweep) / 0.1));
            out.push({
              kind: "dimArc",
              pts: Array.from({ length: n + 1 }, (_, i) => at(cn.from + (cn.sweep * i) / n)).map((z) => to3(f, z)),
            });
          }
        }
        // the parts the pointed-at mark is about, lit in its colour (blue for an applied constraint, yellow for an offer); a named point also lights the lines that end at it; only colour changes, never the weight (`in_1657`, `in_1661`)
        if (st.lit && st.lit.key === k) {
          const names = new Set(st.lit.parts);
          for (const l of p.lines ?? []) if (names.has(l.a) || names.has(l.b)) names.add(l.id);
          for (const q of seg)
            if (names.has(q.name))
              out.push({
                kind: st.lit.offer ? (chosen.has(q.name) ? "litOfferSel" : "litOffer") : "lit",
                pts: polyline(q).map((z) => to3(f, z)),
              });
          for (const id of st.lit.parts) {
            const at = s.points[id];
            if (at)
              out.push({
                kind: st.lit.offer ? "tieBall" : "ball",
                pts: [to3(f, at)],
                r: mmPerPx(f, at) * settings.sketch.ballPx,
              });
          }
        }
      }
      const mv = st.moves && all.get(st.moves.key) ? { f: all.get(st.moves.key)!, list: st.moves.list } : null;
      if (mv)
        for (const { from: a, to: b, main } of mv.list) {
          // a dashed arrow from where a part is to where the offered constraint would put it: strong for the parts it names, pale for what moves only because they do (`in_1631`, `in_1667`)
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
            head = mmPerPx(mv.f, b) * 8,
            ux = (b[0] - a[0]) / len,
            uy = (b[1] - a[1]) / len,
            wing = (sgn: number): [number, number] => {
              const t = 0.45; // (about 25 degrees)
              return [
                b[0] - head * (ux * Math.cos(t) - sgn * uy * Math.sin(t)),
                b[1] - head * (uy * Math.cos(t) + sgn * ux * Math.sin(t)),
              ];
            };
          out.push({ kind: main ? "moveMain" : "move", pts: [to3(mv.f, a), to3(mv.f, b)], dash: dashAt(mv.f, a) });
          out.push({
            kind: main ? "moveMainHead" : "moveHead",
            pts: [to3(mv.f, wing(1)), to3(mv.f, b), to3(mv.f, wing(-1))],
          });
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
          for (const l of shown)
            out.push({
              kind: l.kind,
              pts: l.pts.map((z) => to3(c.f, z)),
              ...(l.kind === "guide" ? { dash: dashAt(c.f, at) } : {}),
              ...(l.kind === "tieBall" ? { r: mmPerPx(c.f, l.pts[0]!) * settings.sketch.ballPx } : {}),
            });
          const arm = mmPerPx(c.f, at) * settings.sketch.crossPx,
            w = to3(c.f, at);
          out.push(
            { kind: "cursor", pts: [add(w, scale(c.f.u, -arm)), add(w, scale(c.f.u, arm))] },
            { kind: "cursor", pts: [add(w, scale(vOf(c.f), -arm)), add(w, scale(vOf(c.f), arm))] },
          );
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
    /** The closed parts of every drawing, to be tinted (a closed figure has a very faint fill in the old app, `in_194`): the outline and holes in each plane's axes. */
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
              found = regions(segsOf(p, sol.points, sol.radii));
            loops = found.profiles.map(
              (q) => [loopPoints(q.outer), ...q.holes.map(loopPoints)] as [number, number][][],
            );
          } catch {
            loops = [];
          }
          fillCache.set(p, loops);
        }
        for (const l of loops) out.push({ frame: { origin: f.origin, u: f.u, v: vOf(f) }, loops: l });
      }
      return out;
    },
    /** The region of the drawing on the plane that is on under the pointer, with the sketch and the plane it is of (what an extrude is made from); null: none. */
    regionAt(x: number, y: number): { key: string; frame: Frame; def: SketchParams; region: Region } | null {
      const c = here(x, y);
      if (!c) return null;
      const region = regionAt(c.p, c.q);
      return region ? { key: c.key, frame: c.f, def: c.p, region } : null;
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
