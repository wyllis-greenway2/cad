// The extrude controller (`in_1566`): the Extrude tool. A click inside a closed part of the drawing picks that region; an arrow stands on it along the plane's normal, to be pulled (a ghost of the body follows at once, in the See-through look);
// the number is a bubble at the arrow's tip, to type over; Enter, the check of the operation bar or a right click applies it as the sketch and extrude steps of the recipe, Esc or the cross gives it up (`interaction/extrude.ts` makes the
// steps; the studio sends them to the engine's worker, which makes the body). The arrow is the mover's kind of handle (`orb.ts`) drawn the mover's way (`orbdraw.ts`).
import { forward, project, type Cam } from "./camera.ts";
import { alongLine, hitHandle, rayOf, unitOf, type Handle } from "./orb.ts";
import { settings } from "./settings.ts";
import { add, scale, type V3 } from "./vec.ts";
import { to3, type P2 } from "./sketch.ts";
import type { Frame } from "./planes.ts";
import { vOf } from "./planes.ts";
import type { SketchParams } from "./engine/sketch.ts";
import type { Step } from "./engine/steps.ts";
import { extrudeSteps, type Region } from "./interaction/extrude.ts";
import type { OrbDrawing } from "./orbcontrol.ts";
import type { Bubble } from "./interaction/bubbles.ts";
import { createBubbleLayer } from "./bubbledraw.ts";
import { createOpBar } from "./opbar.ts";

export interface ExtrudeHost {
  view(): { cam: Cam; w: number; h: number };
  /** the region under the pointer on the plane that is on (the sketch controller's) */
  regionAt(x: number, y: number): { key: string; frame: Frame; def: SketchParams; region: Region } | null;
  /** the recipe now, and a new recipe to be made */
  recipe(): readonly Step[];
  change(steps: Step[]): void;
  /** the view is turned about the region to look at the plane from the side, so the pull can be seen (it was looking straight at it) */
  tilt(frame: Frame, centre: V3, size: number): void;
}
type Pull = { key: string; frame: Frame; def: SketchParams; region: Region; d: number };
const ID = "extrude";

export function createExtrude(host: ExtrudeHost, page: HTMLElement) {
  let armed = false, pull: Pull | null = null, grab: { s0: number; d0: number } | null = null, hover = false;
  const bar = createOpBar(page, { apply: () => apply(), cancel: () => cancel() });
  const layer = createBubbleLayer(page, { set(_id, v) { if (pull && isFinite(v)) pull = { ...pull, d: v }; }, remove() { /* none */ } });

  const base = (p: Pull): V3 => to3(p.frame, p.region.centre);
  /** the arrow: from a little out of the region's middle along the normal (the way it is pulled), to the tip; as long as the pull when that is longer than the arrow */
  const handle = (p: Pull, cam: Cam): Handle => {
    const o = base(p), L = unitOf(cam, o), M = settings.mover, g = M.gapShare * L, A = M.arrowShare * L, dir = scale(p.frame.normal, p.d < 0 ? -1 : 1);
    return { id: ID, kind: "arrow", axis: null, points: [add(o, scale(dir, g)), add(o, scale(dir, g + Math.max(A, Math.abs(p.d))))] };
  };
  const ray = (x: number, y: number) => { const { cam, w, h } = host.view(); return rayOf(cam, w, h, x, y); };
  function apply(): boolean {
    if (!pull) return false;
    if (Math.abs(pull.d) < 1e-6) { cancel(); return true; } // (a pull of nothing makes nothing)
    host.change([...host.recipe(), ...extrudeSteps(host.recipe(), pull.def, pull.frame, pull.region.pick, pull.d)]);
    pull = null; armed = false; grab = null; return true;
  }
  function cancel(): boolean { const was = armed || pull !== null; armed = false; pull = null; grab = null; return was; }

  return {
    active: () => armed || pull !== null,
    pulling: () => pull !== null,
    /** The tool is chosen: the next click inside a part of the drawing picks it. */
    start() { armed = true; pull = null; grab = null; },
    /** A click: with the tool on and nothing picked, it picks the region under it. Returns whether the click was the tool's. */
    click(x: number, y: number): boolean {
      if (!armed && !pull) return false;
      if (pull) return true; // (the arrow is pulled by a press and drag; a click elsewhere does nothing)
      const r = host.regionAt(x, y);
      if (!r) return true;
      pull = { ...r, d: 0 }; armed = false; { const pts = pull.region.loops[0]!, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); host.tilt(pull.frame, to3(pull.frame, pull.region.centre), Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))); }
      return true;
    },
    /** A press: does it take the arrow? */
    grab(x: number, y: number): boolean {
      if (!pull) return false;
      const { cam, w, h } = host.view(), hd = hitHandle([handle(pull, cam)], cam, w, h, x, y);
      if (!hd) return false;
      const s0 = alongLine(ray(x, y), base(pull), pull.frame.normal);
      if (s0 === null) return false;
      grab = { s0, d0: pull.d }; return true;
    },
    grabMove(x: number, y: number): void {
      if (!pull || !grab) return;
      const s = alongLine(ray(x, y), base(pull), pull.frame.normal); if (s === null) return;
      pull = { ...pull, d: Math.round((grab.d0 + s - grab.s0) * 100) / 100 };
    },
    grabEnd(): void { grab = null; },
    apply, cancel,
    /** Enter applies; returns whether it was used. */
    key(code: string): boolean { if (!pull) return false; if (code === "Enter" || code === "NumpadEnter") return apply(); return false; },
    /** The arrow, as the mover's drawing takes it (null: none). */
    drawing(pointer: { x: number; y: number } | null): OrbDrawing | null {
      if (!pull) return null;
      const { cam, w, h } = host.view(), hd = handle(pull, cam), over = pointer && !grab ? hitHandle([hd], cam, w, h, pointer.x, pointer.y) : null;
      hover = !!over;
      return { handles: [hd], hot: over || grab ? [ID] : [], unit: unitOf(cam, base(pull)), orient: false, hover };
    },
    /** What to show before the engine has made it. */
    ghost() {
      if (!pull) return null;
      const f = pull.frame; return { frame: { origin: f.origin, u: f.u, v: vOf(f), n: f.normal }, loops: pull.region.loops as [number, number][][], d: pull.d };
    },
    /** Each picture: the number at the arrow's tip, the operation bar. Returns whether the pointer is over the arrow (for the cursor) and what is said to the person. */
    frame(): { hover: boolean } {
      bar.show(pull ? "Extrude" : armed ? "Extrude: click a closed shape" : null);
      if (!pull) { layer.show([], { lines: [], dots: [] }); return { hover: false }; }
      const { cam, w, h } = host.view(), hd = handle(pull, cam), tip = hd.points[1]!, q = project(cam, tip, w, h);
      const b: Bubble = { id: "d", kind: "dimension", relation: "length", icon: "dimension", at: [0, 0], text: String(pull.d), unit: "mm", value: pull.d, tone: "rest", title: "Distance (type a number)", parts: [] };
      layer.show([{ bubble: b, x: Math.max(60, Math.min(w - 60, q.x)), y: Math.max(70, Math.min(h - 50, q.y)) }], { lines: [], dots: [] });
      return { hover };
    },
    editing: (): boolean => layer.editing(),
    debug: () => ({ armed, pull: pull ? { key: pull.key, d: pull.d, pick: pull.region.pick, loops: pull.region.loops.length } : null }),
  };
}
void forward; void ({} as P2);
