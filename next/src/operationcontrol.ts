// The operation controller (`in_1576`): the one controller of every operation open on the screen (extrude, push or pull a face, round, chamfer, and what comes after). It holds the operation (`interaction/operation.ts`: a description) and does what every operation
// needs: the operation bar (title, kinds, check, cross), the arrow to be pulled and the ghost that follows it, the number to type over, Enter or a right click to apply, Esc to give up. The Extrude tool's wait for a click inside a drawing is the only
// thing particular to one operation here: the click picks what the first operation is made of. The arrow is the mover's kind of handle (`orb.ts`) drawn the mover's way (`orbdraw.ts`).
import { project, type Cam } from "./camera.ts";
import { alongLine, hitHandle, rayOf, unitOf, type Handle } from "./orb.ts";
import { settings } from "./settings.ts";
import { add, scale, type V3 } from "./vec.ts";
import type { Step } from "./engine/steps.ts";
import type { Ask } from "./engine/protocol.ts";
import type { OrbDrawing } from "./orbcontrol.ts";
import type { Bubble } from "./interaction/bubbles.ts";
import type { Operation } from "./interaction/operation.ts";
import { createBubbleLayer } from "./bubbledraw.ts";
import { createOpBar } from "./opbar.ts";

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

export function createOperations(host: OperationHost, page: HTMLElement) {
  let armed = false, op: Operation | null = null, grab: { s0: number; d0: number } | null = null;
  const bar = createOpBar(page, { apply: () => apply(), cancel: () => cancel(), option: (id) => { if (op) op = op.withOption(id); } });
  const layer = createBubbleLayer(page, { set(_id, v) { if (op && isFinite(v)) op = op.withValue(v) ?? op; }, remove() { /* none */ } });
  /** the arrow: from a little out of the thing's middle along its normal (the way it is pulled), to the tip; as long as the pull when that is longer than the arrow */
  const handle = (o: Operation, cam: Cam): Handle => {
    const a = o.arrow!, L = unitOf(cam, a.base), M = settings.mover, g = M.gapShare * L, A = M.arrowShare * L, dir = scale(a.normal, o.value < 0 ? -1 : 1);
    return { id: ID, kind: "arrow", axis: null, points: [add(a.base, scale(dir, g)), add(a.base, scale(dir, g + Math.max(A, Math.abs(o.value))))] };
  };
  const ray = (x: number, y: number) => { const { cam, w, h } = host.view(); return rayOf(cam, w, h, x, y); };
  const close = () => { armed = false; op = null; grab = null; };
  function apply(): boolean {
    if (!op) return false;
    const plan = op.plan(host.recipe()); close();
    if (plan.kind === "steps") host.change(plan.steps);
    else if (plan.kind === "ask") void host.ask(plan.ask).then((r) => { const a = r.ok ? plan.then(r.data) : { why: r.why }; if ("steps" in a) host.change(a.steps); else host.say(a.why); });
    return true;
  }
  function cancel(): boolean { const was = armed || op !== null; close(); return was; }

  return {
    active: () => armed || op !== null,
    pulling: () => op !== null,
    /** An operation is open (made of what was picked on a body): its arrow, ghost and number show. */
    open(o: Operation) { armed = false; grab = null; op = o; if (o.tilt) host.tilt(o.tilt.frame, o.tilt.centre, o.tilt.size); },
    /** The Extrude tool is chosen: the next click inside a closed part of the drawing picks it. */
    start() { armed = true; op = null; grab = null; },
    /** A click: with the tool on and nothing picked, it picks what is under it. Returns whether the click was the tool's. */
    click(x: number, y: number): boolean {
      if (!armed && !op) return false;
      if (op) return true; // (the arrow is pulled by a press and drag; a click elsewhere does nothing)
      const o = host.pick(x, y); if (o) this.open(o);
      return true;
    },
    /** A press: does it take the arrow? */
    grab(x: number, y: number): boolean {
      if (!op?.arrow) return false;
      const { cam, w, h } = host.view();
      if (!hitHandle([handle(op, cam)], cam, w, h, x, y)) return false;
      const s0 = alongLine(ray(x, y), op.arrow.base, op.arrow.normal); if (s0 === null) return false;
      grab = { s0, d0: op.value }; return true;
    },
    grabMove(x: number, y: number): void {
      if (!op?.arrow || !grab) return;
      const s = alongLine(ray(x, y), op.arrow.base, op.arrow.normal); if (s === null) return;
      op = op.withValue(Math.round((grab.d0 + s - grab.s0) * 100) / 100) ?? op;
    },
    grabEnd(): void { grab = null; },
    apply, cancel,
    /** Enter applies; returns whether it was used. */
    key(code: string): boolean { if (!op) return false; if (code === "Enter" || code === "NumpadEnter") return apply(); return false; },
    /** The arrow, as the mover's drawing takes it (null: none). */
    drawing(pointer: { x: number; y: number } | null): OrbDrawing | null {
      if (!op?.arrow) return null;
      const { cam, w, h } = host.view(), hd = handle(op, cam), over = pointer && !grab ? hitHandle([hd], cam, w, h, pointer.x, pointer.y) : null;
      return { handles: [hd], hot: over || grab ? [ID] : [], unit: unitOf(cam, op.arrow.base), orient: false, hover: !!over };
    },
    /** What to show before the engine has made it. */
    ghost: () => op?.ghost ?? null,
    /** Each picture: the number (at the arrow's tip, or where the operation says), the operation bar. */
    frame(): void {
      bar.show(op ? op.title : armed ? "Extrude: click a closed shape" : null, op?.options ?? []);
      if (!op) { layer.show([], { lines: [], dots: [] }); return; }
      const { cam, w, h } = host.view(), tip = op.arrow ? handle(op, cam).points[1]! : op.at, q = project(cam, tip, w, h);
      const b: Bubble = { id: "d", kind: "dimension", relation: "length", icon: "dimension", at: [0, 0], text: String(op.value), unit: "mm", value: op.value, tone: "rest", title: op.valueTitle, parts: [] };
      layer.show([{ bubble: b, x: Math.max(60, Math.min(w - 60, q.x)), y: Math.max(70, Math.min(h - 50, q.y)) }], { lines: [], dots: [] });
    },
    editing: (): boolean => layer.editing(),
    debug: () => ({ armed, pull: op ? { mode: op.kind, d: op.value, ...op.debug } : null }),
  };
}
