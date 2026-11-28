// The marks of a sketch and what their buttons do (`dec_marks_on_things`, `in_1611`..`in_1622`): what is selected shows its constraints (locked) and what is true of it or in range (offered); the part being dragged and the parts just made show their offers; a refusal shows
// what held it back, always; a constraint doing work in a drag fades in. The buttons: an offer is applied, a constraint is taken away, a number is typed over, a padlock locks or lets go. The relation put on the selection by the ring is here too.
import { project } from "./camera.ts";
import { displacements, type Arrow } from "./engine/probe.ts";
import type { Relation, System } from "./engine/solver.ts";
import type { SketchParams } from "./engine/sketch.ts";
import { MEASURE_ID, cornerPts, scopeOf } from "./interaction/bubbles.ts";
import {
  constrain,
  keep,
  nextId,
  retype,
  unconstrain,
  viewSystem,
  type Constrained,
  type Kept,
} from "./interaction/drawing.ts";
import { nearConstraint } from "./interaction/infobar.ts";
import { marksFor, type Mark } from "./interaction/marks.ts";
import type { MarkHandlers, PlacedMark } from "./markdraw.ts";
import type { Frame } from "./planes.ts";
import { settings } from "./settings.ts";
import { onPlane, to2, to3 } from "./sketch.ts";
import type { Core, Shape } from "./sketchcore.ts";

/** what keeps still to hold these parts where they are: a point itself, a line its ends, a circle its centre and its size (and an arc's ends) */
function heldIds(S: System, parts: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of parts) {
    const l = S.lines.find((x) => x.id === id),
      k = S.circles.find((x) => x.id === id);
    if (l) [l.a, l.b].forEach((x) => out.add(x));
    else if (k) [k.id, k.c, ...(k.ends ?? [])].forEach((x) => out.add(x));
    else out.add(id);
  }
  return [...out];
}

/** `ctx.dragged`: the part being dragged (null: none); `ctx.fieldMarks`: the numbers of a figure under way, placed (null: no figure is under way) */
export function createMarks(
  K: Core,
  ctx: {
    dragged(): { id: string; key: string } | null;
    fieldMarks(c: { key: string; f: Frame; p: unknown }, at3: (m: Mark) => PlacedMark): PlacedMark[] | null;
  },
) {
  const { host, sel, st, current, selected, solOf, sysOf, mmPerPx, set, fail } = K;
  let ownId: string | null = null; // (the number a digit typed with a part selected goes to)
  /** what the info bar's buttons do (`dec_three_surfaces`): a suggestion is applied; a constraint clicked is taken away; a number typed over is the number (a measured one locks); a padlock locks or lets go */
  const handlers: MarkHandlers = {
    suggest(id) {
      if (nearConstraint(id))
        apply(id, false); // (a near offer is a pair of parts: its arrows have shown what it does, so it does not flash)
      else act(id);
    },
    /** a mark is pointed at (null: none): its parts and what it would move are drawn */
    hover(id, over) {
      st.hover = id === null ? null : { id, over: over ?? "" };
    },
    hoverAt(x, y) {
      st.hoverPx = { x, y };
    },
    /** an offered constraint, from a mark: the parts it is offered for are selected, and it is applied */
    offer(id, over) {
      const c = current();
      if (!c) return;
      sel.setSketch(c.key, over);
      st.recent = null;
      handlers.suggest(id);
    },
    fact(id) {
      const c = current();
      if (!c) return;
      const r = unconstrain(c.p, id);
      if (r.ok) set(c.key, r.params, "Delete constraint");
      else fail(r.why, r.victims);
    },
    set(id, value) {
      const c = current();
      if (!c) return;
      if (id === MEASURE_ID) {
        lockMeasure(value);
        return;
      } // (a number typed over one that is only measured locks it at that number)
      const r = retype(c.p, id, value);
      if (r.ok) {
        set(c.key, r.params, "Number", `n:${id}`);
        st.flash = {};
      } else fail(r.why, r.victims);
    },
    lock(id) {
      const c = current();
      if (!c) return;
      if (id === MEASURE_ID) {
        lockMeasure();
        return;
      } // (measured: lock it at what it measures now)
      const r = unconstrain(c.p, id);
      if (r.ok) set(c.key, r.params, "Unlock");
      else fail(r.why, r.victims); // (locked: let it go; it is only measured again)
    },
  };

  /** the selection's own number locked: at what it measures now, or at the number typed */
  const lockMeasure = (value?: number) => {
    const c = current();
    if (!c) return;
    const r = constrain(c.p, solOf(c.p), selected(c.key), "dimension", value);
    if (r.ok) {
      set(c.key, r.params, value === undefined ? "Lock number" : "Number");
      st.flash = { applied: [r.added] };
      st.flashUntil = performance.now() + 900;
    } else fail(r.why, r.victims);
  };
  /** put the offer `id` (`rel:<relation>`, or a near offer) on the selection, and flash what was made if asked; false: the sketch said no (and says why), or it is no offer */
  const apply = (id: string, flash: boolean): boolean => {
    const c = current();
    if (!c) return false;
    const r = planOf(c.p, id, selected(c.key));
    if (r?.ok) {
      set(c.key, r.params, "Constraint");
      if (flash) {
        st.flash = { applied: [(r as Extract<Constrained, { ok: true }>).added] };
        st.flashUntil = performance.now() + 900;
      }
      return true;
    }
    if (r) fail(r.why, r.victims);
    return false;
  };
  /** a press on the helper bar: a relation is put on the selection */
  const act = (id: string): void => {
    if (id.startsWith("rel:")) apply(id, true);
  };
  /** what applying an offer makes: the sketch with the constraint added and solved, or why not (null: not an offer). The one place an offer becomes a sketch: the buttons keep what it makes, the arrows only look at it (`in_1638`) */
  const planOf = (p: SketchParams, id: string, over: string[]): Constrained | Kept | null => {
    const nc = nearConstraint(id),
      S = sysOf(p);
    // what moves and what stays (`in_1639`): an offer moves what it is offered for to the part it is matched with, which stays; a pair that was picked moves the first to the second. What cannot stay (it would not hold) is left to give way too.
    const scope = nc ? scopeOf(S, over) : [],
      kind = nc ? nc.kind : id.slice(4),
      movers = nc ? nc.parts.filter((x) => scope.includes(x)) : over.slice(0, 1),
      // (a circle that goes to a point or a line by its edge changes its size and keeps its centre, as a drag of its edge does)
      edgeOf = ["on", "tangent"].includes(kind)
        ? movers.flatMap((x) => S.circles.filter((k) => k.id === x).map((k) => k.c))
        : [],
      stays = [...heldIds(S, nc ? nc.parts.filter((x) => !scope.includes(x)) : over.slice(1)), ...edgeOf];
    const make = (hold: string[]): Constrained | Kept | null =>
      nc
        ? keep(
            {
              ...p,
              constraints: [
                ...(p.constraints ?? []),
                { id: nextId(p, "c"), kind: nc.kind, parts: nc.parts, ...(nc.internal ? { internal: true } : {}) },
              ],
            },
            hold,
          )
        : id.startsWith("rel:")
          ? constrain(p, solOf(p), over, id.slice(4) as Relation | "dimension", undefined, hold)
          : null;
    const r = make(stays);
    return stays.length && r && !r.ok ? make([]) : r;
  };
  /** the arrows of what applying an offer would move (nothing: none; refused: none) */
  const previews = new WeakMap<SketchParams, Map<string, Arrow[]>>();
  const preview = (p: SketchParams, id: string, over: string[]): Arrow[] => {
    const key = `${id}|${over.join(",")}`;
    let m = previews.get(p);
    if (!m) previews.set(p, (m = new Map()));
    const hit = m.get(key);
    if (hit) return hit;
    const k = planOf(p, id, over),
      out = k?.ok ? displacements(sysOf(p), viewSystem(k.params, k.sol), nearConstraint(id)?.parts ?? over) : [];
    m.set(key, out);
    return out;
  };

  return {
    handlers,
    /** a press by its id (`rel:<relation>`): a relation is put on the selection */
    act,
    /** Add a relation to what is selected (the helper bar's, later); false: the sketch said no, and says why. */
    constrain: (kind: Relation | "dimension"): boolean => apply(`rel:${kind}`, true),
    /** The marks standing on the parts (`dec_marks_on_things`): what is selected shows its constraints (locked) and what is true of it and near (offered); the parts just made show their offers for a while and fade; a refusal shows what held it back, always; placed on the page. */
    marks(now: number): PlacedMark[] {
      const c = current();
      st.shown = null;
      if (!c) {
        ownId = null;
        return [];
      }
      const cam = host.view(),
        at3 = (m: Mark): PlacedMark => {
          const q = project(cam.cam, to3(c.f, m.at), cam.w, cam.h),
            // an arrow shorter than the mark would be hidden under it: the mark then stands to the side of its middle, clear of the arrow
            main = (m.moves ?? []).reduce<{ from: [number, number]; to: [number, number] } | null>(
              (a, v) =>
                !a ||
                Math.hypot(v.to[0] - v.from[0], v.to[1] - v.from[1]) >
                  Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1])
                  ? v
                  : a,
              null,
            );
          if (main) {
            const a = project(cam.cam, to3(c.f, main.from), cam.w, cam.h),
              b = project(cam.cam, to3(c.f, main.to), cam.w, cam.h),
              len = Math.hypot(b.x - a.x, b.y - a.y),
              clear = 34;
            if (len < clear) {
              const nx = len > 1e-6 ? -(b.y - a.y) / len : 0,
                ny = len > 1e-6 ? (b.x - a.x) / len : -1,
                side = ny > 0 ? -1 : 1; // (the side that is up on the screen)
              return { mark: m, x: q.x + side * nx * 26, y: q.y + side * ny * 26 };
            }
          }
          return { mark: m, x: q.x, y: q.y };
        };
      const under = ctx.fieldMarks(c, at3); // (a figure under way: its numbers stand on it)
      if (under) {
        ownId = null;
        return under;
      }
      const S = sysOf(c.p),
        picked = selected(c.key),
        has = (id: string) =>
          S.points.some((x) => x.id === id) ||
          S.lines.some((x) => x.id === id) ||
          S.circles.some((x) => x.id === id) ||
          (c.p.arcs ?? []).some((x) => x.id === id);
      const d = ctx.dragged(),
        dragged = d && d.key === c.key ? d.id : null,
        ids = dragged ? [] : picked; // (the part being dragged is what the offers are for, and what it is made of; what was picked waits)
      if (picked.length && !dragged) st.recent = null; // (once the person has picked something, the offers for what was just made are over)
      const fresh = dragged
        ? { ids: [dragged].filter(has), until: Infinity }
        : st.recent && st.recent.key === c.key
          ? { ids: st.recent.ids.filter(has), until: st.recent.until }
          : null;
      const mm = mmPerPx(c.f, [0, 0]),
        reach = settings.helpers.reachPx * mm; // (one distance for every relation: how far an offer may move anything, `in_1665`; in mm)
      const fade = (id: string) => {
        const t = st.activeSince.get(id);
        if (t === undefined) return 1;
        return Math.max(
          0,
          Math.min(1, (now - t) / settings.marks.fadeInMs, ctx.dragged() ? 1 : (st.flashUntil - now) / 400),
        );
      }; // (a constraint doing work fades in; once the drag is over it fades out)
      const list = marksFor(S, ids, {
          flash: st.flash,
          recent: fresh,
          now,
          fade,
          reach,
          preview: (id, over) => preview(c.p, id, over),
        }),
        chosen = [...ids].sort().join();
      ownId = list.find((m) => m.kind === "dimension" && [...m.parts].sort().join() === chosen)?.id ?? null; // (the number a digit goes to)
      // only the mark that is pointed at draws anything: the parts it is about lit, and (an offer) what applying it would move
      const hm = st.hover && list.find((m) => m.id === st.hover!.id && (m.over?.join(",") ?? "") === st.hover!.over);
      // what the pointed-at mark draws, all as shapes in the plane (`in_1675`): the arrow from its bubble to its spot (not a number or an angle: they stand on their own line or corner), a number's dimension line and the thin lines to it, an alignment's line, an angle's corner, and (an offer) the arrows of what applying it would move: strong for the parts it names, pale for what moves only because they do (`in_1667`); when none is named, the longest is the main
      if (hm) {
        const shapes: Shape[] = [];
        if (!hm.onSpot && st.hoverPx) {
          const r = host.ray(st.hoverPx.x, st.hoverPx.y),
            q = onPlane(c.f, r.o, r.d);
          if (q) shapes.push({ t: "arrow", a: to2(c.f, q), b: hm.at, tail: 16, least: 24 });
        }
        if (hm.dim) {
          shapes.push({ t: "arrow", a: hm.dim.a, b: hm.dim.b, both: true, plain: true });
          for (const [a, b] of hm.dim.ext) shapes.push({ t: "thin", a, b });
        }
        if (hm.align) shapes.push({ t: "line", a: hm.align.a, b: hm.align.b });
        if (hm.corner) shapes.push({ t: "curve", pts: cornerPts(hm.corner) });
        if (hm.state === "offer" && hm.moves?.length) {
          const named = new Set(scopeOf(S, hm.parts)),
            len = (m: { from: [number, number]; to: [number, number] }) =>
              Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]),
            some = hm.moves.some((m) => m.of && named.has(m.of)),
            top = hm.moves.reduce((a, m) => (len(m) > len(a) ? m : a), hm.moves[0]!);
          for (const m of hm.moves) {
            const main = some ? !!m.of && named.has(m.of) : m === top;
            shapes.push({ t: "arrow", a: m.from, b: m.to, ...(main ? {} : { pale: true }) });
          }
        }
        st.shown = { key: c.key, parts: hm.parts, offer: hm.state === "offer", shapes };
      }
      return list.map(at3);
    },
    /** Each picture: a refusal's red goes after its time. */
    frame(now: number, dragging: boolean): void {
      if (!dragging && now > st.flashUntil) {
        st.flash = {};
        st.activeSince.clear();
      }
    }, // (while a drag is held, the constraints doing work and the ones holding it back stay)
    /** the offers for what was just made are over (another tool, such as Extrude, is taking the clicks) */
    dismissOffers(): void {
      st.recent = null;
    },
    ownId: (): string | null => ownId,
  };
}
