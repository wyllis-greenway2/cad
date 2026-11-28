// The mover orb's controller: the one place that turns presses, drags and keys on the orb into changes of the thing it stands for. It knows nothing of what the thing is (a cut plane now,
// a body or a sketch plane later): the host says what the orb is on, takes the new frame when it moves, and makes a copy when a second arrow is dragged. The maths is in orb.ts and mover.ts.
import { forward, type Cam } from "./camera.ts";
import { applyDrag, centreOf, choose, clonePose, heldAxes, newPose, type Pose } from "./mover.ts";
import {
  dragTo,
  handlesOf,
  hitHandle,
  nearHandle,
  startGrab,
  unitOf,
  type Grab,
  type Handle,
  type Orb,
} from "./orb.ts";
import type { Frame } from "./planes.ts";
import { dragged } from "./interaction/gesture.ts";

export interface OrbHost {
  /** What the orb is on now (null: no orb is shown), and where that is. */
  target(): { id: string; frame: Frame } | null;
  /** The thing was moved or turned. */
  set(id: string, frame: Frame): void;
  /** A second arrow was dragged: make a copy of the thing, which the orb goes on to (null: it cannot be copied). */
  copy(id: string): { id: string; frame: Frame } | null;
  view(): { cam: Cam; w: number; h: number };
}
/** What the drawing needs: the handles, which are lit, how big a unit is, and whether the orb is being oriented. */
export interface OrbDrawing {
  handles: Handle[];
  hot: string[];
  unit: number;
  orient: boolean;
  hover: boolean;
  /** the ball has been pressed once: the body goes where it is dragged (free move) */ free: boolean;
}

export function createOrbControl(host: OrbHost) {
  const poses = new Map<string, Pose>(); // (the orb's place and axes for each thing: they go with it and are remembered)
  const poseOf = (id: string): Pose => {
    let q = poses.get(id);
    if (!q) {
      q = newPose();
      poses.set(id, q);
    }
    return q;
  };
  let chosen: string[] = [],
    orient = false,
    free = false, // (the ball pressed once: bodies go where they are dragged; pressed again: orient; again: normal)
    freeFor = "",
    was: Pose | null = null;
  let grabbed: {
    g: Grab;
    base: Frame;
    pose: Pose;
    id: string;
    copied: boolean;
    moved: boolean;
    /** taken by the thing itself, not by a handle (a press on a body that is picked): the ball that goes nowhere does not orient */
    free?: boolean;
    x0: number;
    y0: number;
  } | null = null;

  const orb = (): Orb | null => {
    const t = host.target();
    if (!t) return null;
    if (t.id !== freeFor) {
      free = false; // (another thing: back to normal)
      freeFor = t.id;
    }
    const q = poseOf(t.id);
    return { centre: centreOf(t.frame, q), frame: q.frame, orient, held: heldAxes(chosen) };
  };
  const stopOrient = (keep: boolean) => {
    const t = host.target();
    if (!keep && t && was) poses.set(t.id, was);
    orient = false;
    free = false;
    was = null;
    chosen = [];
  };

  return {
    orienting: () => orient,
    /** a thing is gone, or is a new one under the same name: what the orb remembered of it goes (a sketch plane placed again starts with the orb in its middle) */
    forget(id: string): void {
      poses.delete(id);
    },
    /** A press at (x, y): does it take a handle of the orb? */
    grab(x: number, y: number, shift: boolean, rival = Infinity): boolean {
      const o = orb(),
        t = host.target();
      if (!o || !t) return false;
      const { cam, w, h } = host.view(),
        near = nearHandle(handlesOf(o, cam), cam, w, h, x, y);
      if (!near || near.d >= rival) return false; // (an edge or a corner nearer the pointer than the handle is the pointer's: it is picked, not pressed on the orb)
      const hd = near.h;
      if (hd.kind === "arrow" || hd.kind === "turn") {
        const r = choose(chosen, hd.id, shift);
        chosen = r.chosen;
        if (!r.drag) return true;
      }
      const g = startGrab(o, hd, cam, w, h, x, y, forward(cam));
      if (g)
        grabbed = {
          g,
          base: t.frame,
          pose: clonePose(poseOf(t.id)),
          id: t.id,
          copied: false,
          moved: false,
          x0: x,
          y0: y,
        };
      return true;
    },
    /** A press on the thing itself (not a handle): it is taken as the ball is, freely across the view */
    grabFree(x: number, y: number): boolean {
      const o = orb(),
        t = host.target();
      if (!o || !t) return false;
      const { cam, w, h } = host.view(),
        ball = handlesOf(o, cam).find((hd) => hd.kind === "ball"),
        g = ball && startGrab(o, ball, cam, w, h, x, y, forward(cam));
      if (!g) return false;
      grabbed = {
        g,
        base: t.frame,
        pose: clonePose(poseOf(t.id)),
        id: t.id,
        copied: false,
        moved: false,
        free: true,
        x0: x,
        y0: y,
      };
      return true;
    },
    grabMove(x: number, y: number): void {
      if (!grabbed) return;
      const { cam, w, h } = host.view(),
        d = dragTo(grabbed.g, cam, w, h, x, y);
      if (!d) return;
      if (dragged(x - grabbed.x0, y - grabbed.y0)) grabbed.moved = true;
      if (grabbed.g.handle.id.startsWith("copy:") && !grabbed.copied && Math.abs(d.value) > 0.5) {
        // (the first drag of a second arrow makes a copy and takes that along)
        const c = host.copy(grabbed.id);
        if (c) {
          poses.set(c.id, clonePose(poseOf(grabbed.id)));
          grabbed.id = c.id;
          grabbed.base = c.frame;
          grabbed.copied = true;
        }
      }
      const r = applyDrag(grabbed.base, grabbed.pose, d, grabbed.g.handle.axis, orient);
      if (!orient) host.set(grabbed.id, r.frame);
      poses.set(grabbed.id, r.pose);
    },
    /** The press ends: one on the ball that went nowhere goes on through the modes: normal, free move (the ball is lit), orient (it pulses blue: the orb itself is moved and turned), normal again (what was oriented is kept). */
    grabEnd(): void {
      const g = grabbed;
      grabbed = null;
      if (!g || g.g.handle.kind !== "ball" || g.moved || g.free) return;
      if (orient) stopOrient(true);
      else if (free) {
        free = false;
        orient = true;
        was = clonePose(poseOf(g.id));
      } else free = true;
    },
    /** whether the ball has been pressed once and not again (free move: bodies picked whole are carried by a drag) */
    freeMove: (): boolean => free && !orient,
    keep: () => stopOrient(true),
    /** Esc in orient mode: the orb goes back as it was. */
    cancel(): boolean {
      if (!orient) return false;
      stopOrient(false);
      return true;
    },
    /** Esc: let go of the chosen arrows. */
    release(): boolean {
      if (!chosen.length) return false;
      chosen = [];
      return true;
    },
    /** Each picture: what to draw (null: no orb), the pointer being where it is. */
    drawing(pointer: { x: number; y: number } | null): OrbDrawing | null {
      const o = orb();
      if (!o) {
        if (chosen.length) chosen = [];
        if (orient) stopOrient(true);
        return null;
      }
      const { cam, w, h } = host.view(),
        handles = handlesOf(o, cam),
        over = pointer && !grabbed ? hitHandle(handles, cam, w, h, pointer.x, pointer.y) : null;
      return {
        handles,
        hot: [...(over ? [over.id] : []), ...(grabbed ? [grabbed.g.handle.id] : []), ...chosen],
        unit: unitOf(cam, o.centre),
        orient,
        free: free && !orient,
        hover: !!over,
      };
    },
    /** For the dev hook and tests. */
    debug: () => ({ orient, free, chosen: [...chosen], poses: [...poses] }),
  };
}
