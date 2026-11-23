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
import type { EdgeRef, Id } from "./engine/id.ts";
import { extrudeSteps, pushSteps, roundSteps, type Region } from "./interaction/extrude.ts";
import type { OrbDrawing } from "./orbcontrol.ts";
import type { Bubble } from "./interaction/bubbles.ts";
import { createBubbleLayer } from "./bubbledraw.ts";
import { createOpBar } from "./opbar.ts";

export interface ExtrudeHost {
  view(): { cam: Cam; w: number; h: number };
  /** the region under the pointer on the plane that is on (the sketch controller's) */
  regionAt(x: number, y: number): { key: string; frame: Frame; def: SketchParams; region: Region; source: Source | null } | null;
  /** the recipe now, and a new recipe to be made */
  recipe(): readonly Step[];
  change(steps: Step[]): void;
  /** the view is turned about the region to look at the plane from the side, so the pull can be seen (it was looking straight at it) */
  tilt(frame: Frame, centre: V3, size: number): void;
}
type Pull = ({ mode: "extrude"; key: string; frame: Frame; def: SketchParams; region: Region; source: Source | null } | { mode: "push"; frame: Frame; ref: Id; body: string; positions: Float32Array } | { mode: "round"; frame: Frame; body: string; edges: EdgeRef[]; kind: "fillet" | "chamfer" }) & { /** where the arrow stands, and the way it is pulled */ base: V3; normal: V3; d: number };
/** what a sketch that lies on a face of a body is made from: the face and the step that made the body */
export interface Source { face: Id; body: string }
export interface PushArgs { ref: Id; body: string; at: V3; normal: V3; /** the face's triangles (x y z each), to show it moved */ positions: Float32Array }
const ID = "extrude";

export function createExtrude(host: ExtrudeHost, page: HTMLElement) {
  let armed = false, pull: Pull | null = null, grab: { s0: number; d0: number } | null = null, hover = false;
  const bar = createOpBar(page, { apply: () => apply(), cancel: () => cancel() });
  const layer = createBubbleLayer(page, { set(_id, v) { if (pull && isFinite(v) && (pull.mode !== "round" || v > 0)) pull = { ...pull, d: v }; }, remove() { /* none */ } });

  /** the arrow: from a little out of the region's middle along the normal (the way it is pulled), to the tip; as long as the pull when that is longer than the arrow */
  const handle = (p: Pull, cam: Cam): Handle => {
    const o = p.base, L = unitOf(cam, o), M = settings.mover, g = M.gapShare * L, A = M.arrowShare * L, dir = scale(p.normal, p.d < 0 ? -1 : 1);
    return { id: ID, kind: "arrow", axis: null, points: [add(o, scale(dir, g)), add(o, scale(dir, g + Math.max(A, Math.abs(p.d))))] };
  };
  const ray = (x: number, y: number) => { const { cam, w, h } = host.view(); return rayOf(cam, w, h, x, y); };
  function apply(): boolean {
    if (!pull) return false;
    if (Math.abs(pull.d) < 1e-6) { cancel(); return true; } // (a pull of nothing makes nothing)
    if (pull.mode === "round" && pull.d < 0) { cancel(); return true; } // (a pull of nothing makes nothing)
    host.change([...host.recipe(), ...(pull.mode === "extrude" ? extrudeSteps(host.recipe(), pull.def, pull.frame, pull.region.pick, pull.d, pull.source ?? undefined) : pull.mode === "push" ? pushSteps(host.recipe(), pull.ref, pull.body, pull.d) : roundSteps(host.recipe(), pull.edges, pull.body, pull.d, pull.kind))]);
    pull = null; armed = false; grab = null; return true;
  }
  function cancel(): boolean { const was = armed || pull !== null; armed = false; pull = null; grab = null; return was; }

  return {
    active: () => armed || pull !== null,
    pulling: () => pull !== null,
    /** A face of a body is to be pushed or pulled: the arrow stands where it was picked, along the face's outward normal; out adds, in cuts. */
    startPush(a: PushArgs) { armed = false; grab = null; pull = { mode: "push", frame: { origin: a.at, normal: a.normal, u: [1, 0, 0] }, ref: a.ref, body: a.body, positions: a.positions, base: a.at, normal: a.normal, d: 0 }; },
    /** Edges of a body are to be rounded or chamfered: a number (the size) stands at the place picked, to type over; Enter applies. */
    startRound(a: { body: string; edges: EdgeRef[]; kind: "fillet" | "chamfer"; at: V3; size: number }) { armed = false; grab = null; pull = { mode: "round", frame: { origin: a.at, normal: [0, 0, 1], u: [1, 0, 0] }, body: a.body, edges: a.edges, kind: a.kind, base: a.at, normal: [0, 0, 1], d: a.size }; },
    /** The tool is chosen: the next click inside a part of the drawing picks it. */
    start() { armed = true; pull = null; grab = null; },
    /** A click: with the tool on and nothing picked, it picks the region under it. Returns whether the click was the tool's. */
    click(x: number, y: number): boolean {
      if (!armed && !pull) return false;
      if (pull) return true; // (the arrow is pulled by a press and drag; a click elsewhere does nothing)
      const r = host.regionAt(x, y);
      if (!r) return true;
      pull = { mode: "extrude", ...r, base: to3(r.frame, r.region.centre), normal: r.frame.normal, d: 0 }; armed = false; { const pts = pull.region.loops[0]!, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); host.tilt(pull.frame, to3(pull.frame, pull.region.centre), Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))); }
      return true;
    },
    /** A press: does it take the arrow? */
    grab(x: number, y: number): boolean {
      if (!pull || pull.mode === "round") return false;
      const { cam, w, h } = host.view(), hd = hitHandle([handle(pull, cam)], cam, w, h, x, y);
      if (!hd) return false;
      const s0 = alongLine(ray(x, y), pull.base, pull.normal);
      if (s0 === null) return false;
      grab = { s0, d0: pull.d }; return true;
    },
    grabMove(x: number, y: number): void {
      if (!pull || !grab) return;
      const s = alongLine(ray(x, y), pull.base, pull.normal); if (s === null) return;
      pull = { ...pull, d: Math.round((grab.d0 + s - grab.s0) * 100) / 100 };
    },
    grabEnd(): void { grab = null; },
    apply, cancel,
    /** Enter applies; returns whether it was used. */
    key(code: string): boolean { if (!pull) return false; if (code === "Enter" || code === "NumpadEnter") return apply(); return false; },
    /** The arrow, as the mover's drawing takes it (null: none). */
    drawing(pointer: { x: number; y: number } | null): OrbDrawing | null {
      if (!pull || pull.mode === "round") return null;
      const { cam, w, h } = host.view(), hd = handle(pull, cam), over = pointer && !grab ? hitHandle([hd], cam, w, h, pointer.x, pointer.y) : null;
      hover = !!over;
      return { handles: [hd], hot: over || grab ? [ID] : [], unit: unitOf(cam, pull.base), orient: false, hover };
    },
    /** What to show before the engine has made it. */
    ghost() {
      if (!pull) return null;
      if (pull.mode === "round") return null;
      if (pull.mode === "push") return { faceMove: { positions: pull.positions, n: pull.normal, d: pull.d } };
      const f = pull.frame; return { frame: { origin: f.origin, u: f.u, v: vOf(f), n: f.normal }, loops: pull.region.loops as [number, number][][], d: pull.d };
    },
    /** Each picture: the number at the arrow's tip, the operation bar. Returns whether the pointer is over the arrow (for the cursor) and what is said to the person. */
    frame(): { hover: boolean } {
      bar.show(pull ? (pull.mode === "push" ? "Push / pull" : pull.mode === "round" ? (pull.kind === "chamfer" ? "Chamfer: type the size" : "Round: type the size") : "Extrude") : armed ? "Extrude: click a closed shape" : null);
      if (!pull) { layer.show([], { lines: [], dots: [] }); return { hover: false }; }
      const { cam, w, h } = host.view(), tip = pull.mode === "round" ? pull.base : handle(pull, cam).points[1]!, q = project(cam, tip, w, h);
      const b: Bubble = { id: "d", kind: "dimension", relation: "length", icon: "dimension", at: [0, 0], text: String(pull.d), unit: "mm", value: pull.d, tone: "rest", title: pull.mode === "round" ? "Size (type a number)" : "Distance (type a number)", parts: [] };
      layer.show([{ bubble: b, x: Math.max(60, Math.min(w - 60, q.x)), y: Math.max(70, Math.min(h - 50, q.y)) }], { lines: [], dots: [] });
      return { hover };
    },
    editing: (): boolean => layer.editing(),
    debug: () => ({ armed, pull: pull ? { mode: pull.mode, d: pull.d, ...(pull.mode === "extrude" ? { key: pull.key, pick: pull.region.pick, loops: pull.region.loops.length } : pull.mode === "push" ? { face: pull.ref.role } : { edges: pull.edges.length, kind: pull.kind }) } : null }),
  };
}
void forward; void ({} as P2);
