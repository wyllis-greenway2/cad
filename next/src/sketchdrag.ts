// A part of a drawing dragged (`in_1576`, `in_1617`..`in_1621`): the solver follows the pointer with what is held where the pointer puts it; the helpers place what is dragged as when it was drawn (they place, they never constrain); a point let go on another
// point or a curve joins it; a circle's or an arc's edge sets the radius; a line, an arc or a circle by its centre moves as one piece; what is doing work fades in and what holds the drag back flashes (`working`).
import { segsOf } from "./engine/definition.ts";
import { helpersForMotion, type Helped } from "./engine/helpers.ts";
import { radiating, translating } from "./engine/probe.ts";
import type { Pt } from "./engine/region.ts";
import type { SketchParams } from "./engine/sketch.ts";
import { activeOf, dragRadius, dragTo, joinFor, pinsOf } from "./interaction/dragging.ts";
import { hitAt } from "./interaction/drawing.ts";
import { helpShown } from "./interaction/helpshow.ts";
import type { Frame } from "./planes.ts";
import { settings } from "./settings.ts";
import { to3, type P2 } from "./sketch.ts";
import type { Core, DrawLine } from "./sketchcore.ts";

/** `armed`: whether a tool is on (a press then belongs to the tool) */
export function createDrag(K: Core, armed: () => boolean) {
  const { defs, sel, st, solOf, sysOf, here, selected, set, working, polyline, helpDrawn, cross } = K;
  // ---- a part dragged: the solver follows the pointer with the part pinned where it goes (soft: it goes as near as the constraints allow); a point let go on another point or on a curve joins it
  type Drag = {
    key: string;
    def0: SketchParams;
    pins: string[];
    start: Record<string, [number, number]>;
    q0: P2;
    x0: number;
    y0: number;
    moved: boolean;
    shift: boolean;
    id: string;
    join: { id: string; kind: "point" | "curve" } | null;
    snapAt: P2 | null;
    /** a circle's edge pressed: its radius follows the pointer (the circle, its centre) */ edge: {
      circle: string;
      centre: string;
      ends?: [string, string];
    } | null;
    /** what the helpers say of where it is (the same rules as when it was drawn: they place, they never constrain) */ help: Helped | null;
  };
  let drag: Drag | null = null;

  return {
    /** A press on a part with no tool on: it may be dragged (true: the press is taken; a press that goes nowhere is a click, said at `grabEnd`). */
    grab(x: number, y: number, shift: boolean): boolean {
      if (armed()) return false;
      const c = here(x, y);
      if (!c) return false;
      const s = solOf(c.p),
        h = hitAt(c.p, s, c.q, c.tol);
      if (!h) return false;
      const ring = h.kind === "curve" && h.of === "circle" ? (c.p.circles ?? []).find((q) => q.id === h.id) : null,
        arc = h.kind === "curve" && h.of === "arc" ? (c.p.arcs ?? []).find((q) => q.id === h.id) : null; // (a circle's or an arc's edge: its radius follows the pointer; its centre moves it whole)
      const pins = ring || arc ? [] : pinsOf(c.p, h.id);
      if (!pins.length && !ring && !arc) return false;
      drag = {
        key: c.key,
        def0: c.p,
        pins,
        start: Object.fromEntries(pins.map((id) => [id, s.points[id]!])),
        q0: c.q,
        x0: x,
        y0: y,
        moved: false,
        shift,
        id: h.id,
        join: null,
        snapAt: null,
        edge: ring
          ? { circle: ring.id, centre: ring.c }
          : arc
            ? { circle: arc.id, centre: arc.c, ends: [arc.a, arc.b] }
            : null,
        help: null,
      };
      return true;
    },
    grabMove(x: number, y: number): void {
      if (!drag) return;
      const c = here(x, y);
      if (!c) return;
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < 4) return; // (a press that has not gone anywhere yet is still a click)
      drag.moved = true;
      drag.join = null;
      drag.snapAt = null;
      drag.help = null;
      const sol0 = solOf(drag.def0),
        S0 = sysOf(drag.def0);
      if (drag.edge) {
        // a circle's or an arc's edge: the place the helpers give the edge (a tangent, an equal radius) sets the radius
        const e = drag.edge,
          centre = sol0.points[e.centre]!;
        drag.help = helpersForMotion(S0, radiating(S0, e.circle), [0, 0], c.q, c.mm, settings.helpers); // (the place is a point of the edge: the radius is its distance from the centre)
        const at = drag.help.acted.length ? drag.help.at : c.q,
          rad = Math.max(1e-3, Math.hypot(at[0] - centre[0], at[1] - centre[1]));
        let r: { params: SketchParams; held: string[] } | null;
        if (e.ends) {
          // an arc: both ends go along their own lines out of the centre to the new radius
          const pins: Record<string, P2> = { [e.centre]: centre };
          for (const end of e.ends) {
            const q = sol0.points[end]!,
              n = Math.hypot(q[0] - centre[0], q[1] - centre[1]) || 1;
            pins[end] = [centre[0] + ((q[0] - centre[0]) / n) * rad, centre[1] + ((q[1] - centre[1]) / n) * rad];
          }
          r = dragTo(drag.def0, pins);
        } else r = dragRadius(drag.def0, e.circle, rad);
        if (!r) return;
        defs.set(drag.key, r.params);
        working(activeOf(drag.def0, r.params, e.ends ? [e.centre, ...e.ends] : [e.centre, e.circle]), r.held);
        return;
      }
      let d: P2 = [c.q[0] - drag.q0[0], c.q[1] - drag.q0[1]];
      const lone = drag.pins.length === 1 && drag.id === drag.pins[0],
        at0 = drag.start[drag.pins[0]!]!,
        motion = translating(S0, drag.pins); // (what is pressed moves as one: a point, a line's ends, an arc's three points)
      const hint = (want: Pt) => {
        // the helpers place what is dragged, as when it was drawn: they place, they never constrain
        const help = helpersForMotion(S0, motion, at0, want, c.mm, settings.helpers);
        drag!.help = help.acted.length || help.holds.length ? help : null;
        if (help.acted.length) d = [help.at[0] - at0[0], help.at[1] - at0[1]];
      };
      const want: Pt = [at0[0] + d[0], at0[1] + d[1]];
      if (lone) {
        // one point: it sticks to another point or a curve near it, else the helpers place it (an alignment, a tangent for the end of a line, on a line)
        const j = joinFor(drag.def0, sol0, drag.id, want, c.tol);
        if (j) {
          drag.join = { id: j.id, kind: j.kind };
          drag.snapAt = j.at;
          d = [j.at[0] - at0[0], j.at[1] - at0[1]];
        } else hint(want);
      } else hint(want);
      const pins = Object.fromEntries(
        drag.pins.map((id) => [id, [drag!.start[id]![0] + d[0], drag!.start[id]![1] + d[1]] as [number, number]]),
      );
      const r = dragTo(drag.def0, pins);
      if (!r) return; // (a place that cannot be solved: the part stays where it was last)
      defs.set(drag.key, r.params);
      working(activeOf(drag.def0, r.params, drag.pins), r.held);
    },
    grabEnd(): void {
      const g = drag;
      drag = null;
      if (!g) return;
      if (!g.moved) {
        // it was a click on the part: it is picked
        const was = selected(g.key);
        sel.setSketch(g.key, g.shift ? (was.includes(g.id) ? was.filter((q) => q !== g.id) : [...was, g.id]) : [g.id]);
        return;
      }
      const next = defs.get(g.key) ?? g.def0; // (a point let go on another point or a curve lands there; no constraint is made by it)
      defs.set(g.key, g.def0); // (the history takes the whole move as one change, from where it began)
      set(g.key, next, "Drag");
      sel.setSketch(g.key, [g.id]);
      st.flash = {};
      st.activeSince.clear();
    },
    /** what the helpers say of where the dragged point or edge is, and the cross where a point would stick: the same drawing as when the figure was drawn (orange ties, dashed guides) */
    hintLines(all: Map<string, Frame>): DrawLine[] {
      const out: DrawLine[] = [];
      if (drag?.help) {
        // what the helpers say of where the dragged point or edge is: the same drawing as when the figure was drawn (orange ties, dashed guides)
        const f = all.get(drag.key),
          p = defs.get(drag.key);
        if (f && p) {
          const sol = solOf(p),
            h = drag.help,
            at = h.at,
            shown = helpShown(
              h,
              (part) => {
                const g = segsOf(p, sol.points, sol.radii).find((x) => x.name === part);
                return g ? polyline(g) : null;
              },
              (id) => sol.points[id] ?? null,
            );
          out.push(...helpDrawn(f, shown, at));
        }
      }
      if (drag?.snapAt) {
        const f = all.get(drag.key);
        if (f) {
          out.push(...cross(f, drag.snapAt, 1.4));
        }
      }
      return out;
    },
    /** the part being dragged, once it has moved (null: none) */
    dragged: (): { id: string; key: string } | null => (drag && drag.moved ? { id: drag.id, key: drag.key } : null),
    held: (): boolean => drag !== null,
    debug: () =>
      drag
        ? { id: drag.id, moved: drag.moved, edge: drag.edge, acted: drag.help?.acted.map((x) => x.relation) ?? null }
        : null,
  };
}
