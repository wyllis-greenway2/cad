// The operation controller (`in_1576`): the one controller of every operation open on the screen (extrude, push or pull a face, round, chamfer, and what comes after). It holds the operation (`interaction/operation.ts`: a description) and does what every operation
// needs: the operation bar (title, kinds, check, cross), the arrow to be pulled and the ghost that follows it, the number to type over, Enter or a right click to apply, Esc to give up. The Extrude tool's wait for a click inside a drawing is the only
// thing particular to one operation here: the click picks what the first operation is made of. The arrow is the mover's kind of handle (`orb.ts`) drawn the mover's way (`orbdraw.ts`).
import { forwardDepth, project, viewHeight, type Cam } from "./camera.ts";
import type { Ask } from "./engine/protocol.ts";
import type { Step } from "./engine/steps.ts";
import type { InfoHandlers } from "./infobardraw.ts";
import type { Bubble } from "./interaction/bubbles.ts";
import type { Info } from "./interaction/infobar.ts";
import type { Operation } from "./interaction/operation.ts";
import { hitHandle, pullDelta, unitOf, type Handle } from "./orb.ts";
import type { OrbDrawing } from "./orbcontrol.ts";
import { settings } from "./settings.ts";
import { add, scale, type V3 } from "./vec.ts";

export interface OperationHost {
  view(): { cam: Cam; w: number; h: number };
  /** the operation the Extrude tool makes of a click at this place (null: nothing closed there) */
  pick(x: number, y: number): Operation | null;
  /** the recipe now, and a new recipe to be made */
  recipe(): readonly Step[];
  change(steps: Step[]): void;
  /** a question for the worker, and a sentence for the person */
  ask(a: Ask): Promise<{ ok: true; data: unknown } | { ok: false; why: string }>;
  say(text: string): void;
  /** the view is turned about a place to look at the plane from the side, so the pull can be seen (it was looking straight at it) */
  tilt(frame: { origin: V3; normal: V3; u: V3 }, centre: V3, size: number): void;
}
const ID = "operation";
/** the icons of the kinds of a pull (the old chips' words are their tooltips) */
const OPTION_ICON: Record<string, string> = {
  edit: "moveFace",
  push: "pushpull",
  move: "extend",
  offset: "offset",
  fillet: "round",
  chamfer: "chamfer",
};

export function createOperations(host: OperationHost) {
  let tie: string | null = null,
    armed = false,
    op: Operation | null = null,
    grab: { x0: number; y0: number; d0: number } | null = null,
    applyNext = false, // (the number now being typed was begun by digits with the operation showing: Enter sets it and makes the operation, as the old app's did)
    auto = false, // (it came by itself, from a pick: `autohandles.ts`)
    touched = false, // (and the person has dragged it, typed a number or chosen a kind)
    numberAsked = false; // (digits were typed: the number is to be shown to take them)
  /** the arrow, as in the old app: centred on the place it is anchored at, along the way it is pulled, with a head at each end; long enough to reach the pull when that is longer than it is */
  const handle = (o: Operation, cam: Cam): Handle => {
    const a = o.arrow!,
      L = unitOf(cam, a.base),
      A = settings.mover.arrowShare * L,
      dir = scale(a.normal, o.pulled < 0 ? -1 : 1);
    return {
      id: ID,
      kind: "arrow",
      axis: null,
      both: true,
      points: [add(a.base, scale(dir, -A / 2)), a.base, add(a.base, scale(dir, Math.max(A / 2, Math.abs(o.pulled))))],
    };
  };
  const close = () => {
    armed = false;
    op = null;
    grab = null;
    tie = null;
    auto = touched = numberAsked = false;
  };
  function apply(): boolean {
    if (!op) return false;
    const plan = op.plan(host.recipe());
    close();
    if (plan.kind === "steps") host.change(plan.steps);
    else if (plan.kind === "ask")
      void host.ask(plan.ask).then((r) => {
        const a = r.ok ? plan.then(r.data) : { why: r.why };
        if ("steps" in a) host.change(a.steps);
        else host.say(a.why);
      });
    return true;
  }
  function cancel(): boolean {
    const was = armed || op !== null;
    close();
    return was;
  }

  return {
    active: () => armed || (op !== null && !(auto && !touched)), // (an arrow that came by itself and is untouched is not in the way of anything)
    /** an arrow that came by itself and has not been touched is put away */
    drop(): void {
      if (op && auto && !touched) close();
    },
    /** an arrow that came by itself has been touched: it is a draft the person is making */
    draft: (): boolean => op !== null && auto && touched,
    pulling: () => op !== null,
    /** An operation is open (made of what was picked on a body): its arrow, ghost and number show. */
    open(o: Operation, byItself = false) {
      armed = false;
      grab = null;
      op = o;
      auto = byItself;
      touched = numberAsked = false;
      if (o.tilt && !byItself) host.tilt(o.tilt.frame, o.tilt.centre, o.tilt.size); // (the view is not moved for an arrow that came by itself from a pick: it is as a face's, which does not move it)
    },
    /** The Extrude tool is chosen: the next click inside a closed part of the drawing picks it. */
    start() {
      armed = true;
      op = null;
      grab = null;
    },
    /** A click: with the tool on and nothing picked, it picks what is under it. Returns whether the click was the tool's. */
    click(x: number, y: number): boolean {
      if (!armed && !op) return false;
      if (op && auto && !touched) {
        close(); // (an arrow that came by itself and has not been touched is put away by the next click, which goes on to do its own work)
        return false;
      }
      if (op) return true; // (the arrow is pulled by a press and drag; a click elsewhere does nothing)
      const o = host.pick(x, y);
      if (o) this.open(o);
      return true;
    },
    /** A press: does it take the arrow? */
    grab(x: number, y: number): boolean {
      if (!op?.arrow) return false;
      const { cam, w, h } = host.view();
      if (!hitHandle([handle(op, cam)], cam, w, h, x, y)) return false;
      grab = { x0: x, y0: y, d0: op.pulled };
      return true;
    },
    grabMove(x: number, y: number): void {
      if (!op?.arrow || !grab) return;
      const { cam, w, h } = host.view(),
        raw =
          Math.round((grab.d0 + pullDelta(cam, w, h, op.arrow.base, op.arrow.normal, x - grab.x0, y - grab.y0)) * 100) /
          100,
        mm = viewHeight(cam, Math.max(forwardDepth(cam, op.arrow.base), 1e-3)) / h, // (a pixel's worth in mm, where the arrow stands)
        flush = op.snap?.(raw, settings.helpers.linePx * mm) ?? null; // (the pull is placed flush with another face when it is near one: it places, it never constrains)
      touched = true;
      tie = flush ? flush.tie : null;
      op = op.withPull(flush ? Math.round(flush.d * 100) / 100 : raw) ?? op;
    },
    grabEnd(): void {
      grab = null;
      tie = null;
    },
    /** the face the pull is flush with, while it is (`engine/flush.ts`; null: none), to be lit */
    tie: (): string | null => tie,
    apply,
    cancel,
    /** digits were typed with the number not shown: it is to be shown (the key goes to it once it is) */
    askNumber(): void {
      numberAsked = true;
    },
    /** digits typed with an operation showing have begun its number: Enter will make the operation as well as set the number */
    typedBegun(): void {
      applyNext = true;
    },
    /** the number is not being typed (it was let go): no operation is waiting on Enter */
    typedDone(): void {
      applyNext = false;
    },
    /** Enter applies; returns whether it was used. */
    key(code: string): boolean {
      if (!op) return false;
      if (code === "Enter" || code === "NumpadEnter") return apply();
      return false;
    },
    /** The arrow, as the mover's drawing takes it (null: none). */
    drawing(pointer: { x: number; y: number } | null): OrbDrawing | null {
      if (!op?.arrow) return null;
      const { cam, w, h } = host.view(),
        hd = handle(op, cam),
        over = pointer && !grab ? hitHandle([hd], cam, w, h, pointer.x, pointer.y) : null;
      return {
        handles: [hd],
        hot: over || grab ? [ID] : [],
        unit: unitOf(cam, op.arrow.base),
        orient: false,
        hover: !!over,
      };
    },
    /** What to show before the engine has made it. */
    ghost: () => op?.ghost ?? null,
    /** Another kind chosen (a chip of the pill). */
    option(id: string) {
      if (op) {
        op = op.withOption(id);
        touched = true;
      }
    },
    /** Whether what is open is valid to make (a size above nothing). */
    valid: (): boolean => op !== null && Math.abs(op.value) > 1e-9,
    /** The sentence for what is open (a persistent notice while it is). */
    words: (): string | null =>
      op
        ? `${op.title}. ${op.arrow ? "Drag the arrow or type a number" : "Type a number"}. Right click finishes, Esc cancels.`
        : null,
    /** What the info bar says while an operation is open: its number (on the left, typed over like any other), standing by the arrow's tip or where the operation says; null: no operation is open. */
    subject(): { info: Info; at: [number, number]; on: InfoHandlers } | null {
      if (!op) return null;
      const { cam, w, h } = host.view(),
        tip = op.arrow ? handle(op, cam).points[1]! : op.at,
        q = project(cam, tip, w, h);
      const f: Bubble = {
        id: "d",
        kind: "dimension",
        relation: "length",
        icon: "dimension",
        at: [0, 0],
        text: String(Math.round(op.value * 1000) / 1000),
        unit: "mm",
        value: op.value,
        tone: "rest",
        title: op.valueTitle,
        parts: [],
      };
      return {
        info: {
          facts: !auto || touched || numberAsked ? [f] : [],
          suggestions: op.options
            .filter((o) => !o.on && o.enabled)
            .map((o) => ({
              id: `opt:${o.id}`,
              icon: OPTION_ICON[o.id] ?? "pushpull",
              title: o.label,
              tone: "offer" as const,
            })),
        },
        at: [Math.max(60, Math.min(w - 60, q.x)), Math.max(70, Math.min(h - 50, q.y))],
        on: {
          suggest: (id) => {
            if (id.startsWith("opt:") && op) {
              op = op.withOption(id.slice(4));
              touched = true;
            }
          },
          fact() {
            /* none */
          },
          lock() {
            /* none */
          },
          set: (_id, v) => {
            if (op && isFinite(v)) {
              op = op.withValue(v) ?? op;
              touched = true;
              if (applyNext) {
                applyNext = false;
                if (Math.abs(op.value) > 1e-9) apply();
              }
            }
          },
        },
      };
    },
    debug: () => ({
      armed,
      pull: op ? { mode: op.kind, d: op.value, pulled: op.pulled, arrow: op.arrow, ...op.debug } : null,
    }),
  };
}
