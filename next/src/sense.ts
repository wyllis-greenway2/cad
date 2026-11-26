// What the camera needs to know about the scene: how big a step is, which point it looks at, and whether anything is in view. Pure.
// Two measures of distance only: `scaleAmong` (the scale of what the eye is among: steps, the depth range, how far ahead to look when nothing
// is) and `gridLevel` (how far the plane is).
import { add, len, scale, sub, type V3 } from "./vec.ts";
import { forward, project, reachOf, type Cam } from "./camera.ts";
import { centreOf, hitThings, type Scene, type Thing } from "./scene.ts";
import { settings } from "./settings.ts";

/** The world's own axes, as one thing, for when the model has nothing (and so there is still something to be lost from). */
/** The fog's reach when there is none (an orthographic view: everything is at the same scale). */
const NO_FOG = 1e9;
const WORLD: Thing = { id: "world", lo: [0, 0, 0], hi: [24, 24, 24] };
const thingsOf = (sc: Scene): Thing[] => (sc.things.length ? sc.things : [WORLD]);

/**
 * The point looked at, which an orbit turns about and a change of view holds: the average of the centres of what is in view, each weighted by how big it looks and by how near the middle of the screen it is
 * (a share, fading smoothly, over `gazeWindow` of the view's height). One thing that fills the view is its own centre; a group of small things in view, as when zoomed out, is the group's middle; and as the view
 * moves from one to the other the point moves with it, with no switch to flip. It is always on the screen (the average of points on the screen is). With nothing in view, the point straight ahead at the scale of what the eye is among.
 */
export function focusOf(sc: Scene, c: Cam, w: number, h: number): V3 {
  let sum = 0,
    acc: V3 = [0, 0, 0];
  for (const t of sc.things) {
    const p = centreOf(t),
      at = project(c, p, w, h);
    if ((c.ortho === null && at.depth <= 0) || at.x < 0 || at.x > w || at.y < 0 || at.y > h) continue; // (behind the eye or off the screen: not in view; turning about it would swing what is looked at out of the picture)
    const d = Math.hypot(at.x - w / 2, at.y - h / 2) / h; // how far from the middle of the screen, in heights of the view
    const weight =
      apparentSize(c, t, w, h) * (Math.exp(-((d / settings.view.gazeWindow) ** 2)) + settings.view.gazeFloor);
    sum += weight;
    acc = add(acc, scale(p, weight));
  }
  return sum > 0 ? scale(acc, 1 / sum) : add(c.eye, scale(forward(c), scaleAmong(sc, c)));
}
/** How big a thing looks: the diagonal of its box on the screen, in heights of the view. */
function apparentSize(c: Cam, t: Thing, w: number, h: number): number {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const x of [t.lo[0], t.hi[0]])
    for (const y of [t.lo[1], t.hi[1]])
      for (const z of [t.lo[2], t.hi[2]]) {
        const q = project(c, [x, y, z], w, h);
        x0 = Math.min(x0, q.x);
        x1 = Math.max(x1, q.x);
        y0 = Math.min(y0, q.y);
        y1 = Math.max(y1, q.y);
      }
  return Math.max(Math.hypot(x1 - x0, y1 - y0) / h, 1e-6);
}

/** Does any of the thing's box show in the view, and big enough to see (6 px across, or a lone point on the screen)? Boxes behind the eye do not count. */
function inView(c: Cam, w: number, h: number, t: Thing): boolean {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    front = 0;
  for (const x of [t.lo[0], t.hi[0]])
    for (const y of [t.lo[1], t.hi[1]])
      for (const z of [t.lo[2], t.hi[2]]) {
        const p = project(c, [x, y, z], w, h);
        if (c.ortho === null && p.depth <= 1e-3) continue; // (an orthographic view has no behind: the eye is only where the view is held)
        front++;
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
  if (!front || x1 < 0 || x0 > w || y1 < 0 || y0 > h) return false;
  const lone = len(sub(t.hi, t.lo)) < 1e-6;
  return lone || Math.max(x1 - x0, y1 - y0) >= settings.view.visiblePx;
}
export const nothingInView = (sc: Scene, c: Cam, w: number, h: number): boolean =>
  !thingsOf(sc).some((t) => inView(c, w, h, t));
/** The last thing in view (the most recently made, if several), to be remembered while none is. */
export const lastSeen = (sc: Scene, c: Cam, w: number, h: number): string | null =>
  [...thingsOf(sc)].reverse().find((t) => inView(c, w, h, t))?.id ?? null;
/** The thing a Reset goes to: the one last seen, else the last there is. */
export const resetTarget = (sc: Scene, seen: string | null): Thing => {
  const ts = thingsOf(sc);
  return ts.find((t) => t.id === seen) ?? ts[ts.length - 1]!;
};

/** Which little pane of the world planes a ray goes through, if any: the pane for the plane across `axis` is a square in the positive quarter of that plane, a little way from the origin. */
function pickPane(from: V3, dir: V3, gizmoScale = 1): { axis: 0 | 1 | 2; t: number } | null {
  const lo = settings.world.paneGapMm * gizmoScale,
    hi = lo + settings.world.paneMm * gizmoScale;
  let best: { axis: 0 | 1 | 2; t: number } | null = null;
  for (const k of [0, 1, 2] as const) {
    if (Math.abs(dir[k]) < 1e-12) continue;
    const t = -from[k] / dir[k];
    if (t <= 0) continue;
    const ok = [0, 1, 2].every(
      (i) =>
        i === k ||
        (() => {
          const v = from[i]! + dir[i]! * t;
          return v >= lo && v <= hi;
        })(),
    );
    if (ok && (!best || t < best.t)) best = { axis: k, t };
  }
  return best;
}
/** Where a ray meets the world plane across `axis` (through the origin), if in front of the eye. */
export function planeHit(from: V3, dir: V3, axis: 0 | 1 | 2): { t: number; point: V3 } | null {
  if (Math.abs(dir[axis]) < 1e-12) return null;
  const t = -from[axis] / dir[axis];
  return t > 0 ? { t, point: add(from, scale(dir, t)) } : null;
}

/**
 * The grid's spacing and the fog's reach, from the camera's distance to the plane that is on and from the origin, and from nothing else: not
 * from where the view points, and not from what is in it.
 * The spacing is a power of ten, and `blend` (0 to 1) says how far the view has gone toward the next one up, so that the lines of one spacing
 * fade into the next and nothing pops.
 */
export const gridLevel = (c: Cam, plane: 0 | 1 | 2) => gridLevelAt(c, Math.abs(c.eye[plane]));
/** The same for a plane that is `distance` from the eye (a sketch plane that is not a world plane). */
export function gridLevelAt(c: Cam, distance: number): { step: number; blend: number; fog: number; span: number } {
  const ortho = c.ortho !== null;
  const height = Math.max(ortho ? reachOf(c) : distance * c.lens, settings.view.minSurfaceMm); // (the distance to the plane as the picture sees it)
  const e = Math.log10(height / settings.world.gridCells),
    k = Math.floor(e),
    step = 10 ** k;
  // fog fades the grid with the distance from the eye; an orthographic view has none (everything is at the same scale), and draws the grid only
  // as far as the picture shows, so the numbers the picture works with stay small
  const fog = ortho ? NO_FOG : Math.max(len(c.eye), (settings.world.fogMinSteps * step) / c.lens);
  return {
    step,
    blend: e - k,
    fog,
    span: ortho ? settings.world.orthoSpan * c.ortho! : fog * settings.world.gridSpanFog,
  };
}

/**
 * The pane a pointer is over, with a face of a thing counting only if it lies exactly in the pane's plane (`in_1409`): where a ray meets a
 * thing's face that is not in the plane of the
 * pane, the face is what is pointed at (standard selection), whether the pane is in front of it or behind it. A pane over a face in the very
 * same plane is the pane.
 */
export function paneAt(sc: Scene, from: V3, dir: V3, gizmoScale = 1): { axis: 0 | 1 | 2; t: number } | null {
  const p = pickPane(from, dir, gizmoScale);
  if (!p) return null;
  const h = hitThings(sc, from, dir);
  if (!h) return p;
  const exact = Math.abs(h.normal[p.axis]!) === 1 && Math.abs(from[p.axis]! + dir[p.axis]! * h.t) < 1e-6; // (the face faces along the pane's axis, and is at the plane through the origin)
  return exact ? p : null;
}

/**
 * The scale of what the eye is among: how far the nearest thing's middle is, never less than that thing's own size or `minFlightMm`. A step of
 * flight or of the wheel is a share of it, so the eye comes to a wall, goes
 * through it and crosses the inside at a pace that follows the scale of things (`in_1411`); the depth range of the drawing is a multiple of
 * it; and with nothing to look at, it is how far ahead the point looked at is.
 * It changes smoothly from place to place, so going and coming back are the same.
 */
export function scaleAmong(sc: Scene, c: Cam): number {
  let best = Infinity;
  for (const t of sc.things) best = Math.min(best, Math.max(len(sub(centreOf(t), c.eye)), len(sub(t.hi, t.lo)) / 2));
  if (!isFinite(best)) best = len(c.eye); // (nothing there: how far from the origin)
  return Math.max(best, settings.view.minFlightMm);
}
