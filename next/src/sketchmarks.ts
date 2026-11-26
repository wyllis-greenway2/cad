// The marks of a sketch and what their buttons do (`dec_marks_on_things`, `in_1611`..`in_1622`): what is selected shows its constraints (locked) and what is true of it or in range (offered); the part being dragged and the parts just made show their offers; a refusal shows
// what held it back, always; a constraint doing work in a drag fades in. The buttons: an offer is applied, a constraint is taken away, a number is typed over, a padlock locks or lets go. The relation put on the selection by the ring is here too.
import { project } from "./camera.ts";
import type { Relation } from "./engine/solver.ts";
import { MEASURE_ID } from "./interaction/bubbles.ts";
import { constrain, keep, nextId, retype, unconstrain } from "./interaction/drawing.ts";
import { nearConstraint } from "./interaction/infobar.ts";
import { marksFor, type Mark } from "./interaction/marks.ts";
import type { MarkHandlers, PlacedMark } from "./markdraw.ts";
import type { Frame } from "./planes.ts";
import { settings } from "./settings.ts";
import { to3 } from "./sketch.ts";
import type { Core } from "./sketchcore.ts";

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
      const c = current();
      if (!c) return;
      const nc = nearConstraint(id);
      if (!nc) {
        act(id);
        return;
      }
      const k = keep({
        ...c.p,
        constraints: [
          ...(c.p.constraints ?? []),
          { id: nextId(c.p, "c"), kind: nc.kind, parts: nc.parts, ...(nc.internal ? { internal: true } : {}) },
        ],
      });
      if (k.ok) set(c.key, k.params, "Constraint");
      else fail(k.why, k.victims);
    },
    /** an offered constraint, from a mark: the parts it is offered for are selected, and it is applied */
    offer(id, over) {
      const c = current();
      if (!c) return;
      sel.setSketch(c.key, over);
      st.recent = null;
      this.suggest(id);
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
  /** a press on the helper bar: a relation is put on the selection */
  const act = (id: string): void => {
    const c = current();
    if (!c) return;
    if (id.startsWith("rel:")) {
      const r = constrain(c.p, solOf(c.p), selected(c.key), id.slice(4) as Relation | "dimension");
      if (r.ok) {
        set(c.key, r.params, "Constraint");
        st.flash = { applied: [r.added] };
        st.flashUntil = performance.now() + 900;
      } else fail(r.why, r.victims);
    }
  };

  return {
    handlers,
    /** a press by its id (`rel:<relation>`): a relation is put on the selection */
    act,
    /** Add a relation to what is selected (the helper bar's, later); false: the sketch said no, and says why. */
    constrain(kind: Relation | "dimension"): boolean {
      const c = current();
      if (!c) return false;
      const r = constrain(c.p, solOf(c.p), selected(c.key), kind);
      if (r.ok) {
        set(c.key, r.params, "Constraint");
        st.flash = { applied: [r.added] };
        st.flashUntil = performance.now() + 900;
        return true;
      }
      fail(r.why, r.victims);
      return false;
    },
    /** The marks standing on the parts (`dec_marks_on_things`): what is selected shows its constraints (locked) and what is true of it and near (offered); the parts just made show their offers for a while and fade; a refusal shows what held it back, always; placed on the page. */
    marks(now: number): PlacedMark[] {
      const c = current();
      if (!c) {
        ownId = null;
        return [];
      }
      const cam = host.view(),
        at3 = (m: Mark): PlacedMark => {
          const q = project(cam.cam, to3(c.f, m.at), cam.w, cam.h);
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
        reach = { pointMm: settings.helpers.pointPx * mm, lineMm: settings.helpers.linePx * mm }; // (in range, however things came there: the helpers' reach in mm)
      const fade = (id: string) => {
        const t = st.activeSince.get(id);
        if (t === undefined) return 1;
        return Math.max(
          0,
          Math.min(1, (now - t) / settings.marks.fadeInMs, ctx.dragged() ? 1 : (st.flashUntil - now) / 400),
        );
      }; // (a constraint doing work fades in; once the drag is over it fades out)
      const list = marksFor(S, ids, { flash: st.flash, recent: fresh, now, fade, reach }),
        chosen = [...ids].sort().join();
      ownId = list.find((m) => m.kind === "dimension" && [...m.parts].sort().join() === chosen)?.id ?? null; // (the number a digit goes to)
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
