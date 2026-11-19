// The eye of a hidden body (`dec_hidden_bodies`, `in_489`, `in_1176`): a body that is hidden takes no pick, so it cannot be selected; while the pointer is over it on the screen (or on the way up to where its icon is) the helpful bar (`suggest.ts`) shows
// with the eye as its only icon, and a click on it brings the body back. This only finds which hidden body the pointer is over and where the bar goes (above its top edge on the screen); the bar is drawn by `suggest.ts`.
import type { Vec3 } from "../interaction/api.ts";

export interface BodyEye { ref: string; hidden: boolean; corners: Vec3[]; /** the body is selected: its play button shows */ selected?: true; /** a body hooked up to an animation: its play (or pause) button */ play?: "play" | "pause" }

/** The convex hull of points (Andrew's monotone chain). */
function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: [number, number][]) => { const h: [number, number][] = []; for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return [...build(p), ...build([...p].reverse())];
}
const inside = (pt: [number, number], poly: [number, number][]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i]!, poly[j]!];
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/** The hidden body the pointer (a page point) is over, and the page point above its top edge where the bar goes; null when none. `screen` puts a point of the scene on the page. */
export function hiddenBodyUnder(bodies: readonly BodyEye[], screen: (q: Vec3) => [number, number] | null, pointer: [number, number] | null): { ref: string; at: [number, number] } | null {
  if (!pointer) return null;
  for (const b of bodies) {
    if (!b.hidden) continue;
    const pts = b.corners.map(screen);
    if (pts.some((q) => !q)) continue;
    const h = hull(pts as [number, number][]);
    const top = h.reduce((a, q) => (q[1] < a[1] ? q : a), h[0]!);
    const above: [number, number] = [top[0], top[1] - 24];
    const near = Math.hypot(pointer[0] - above[0], pointer[1] - above[1]) < 40; // (the way up to the bar from the body counts too)
    if (inside(pointer, h) || near) return { ref: b.ref, at: above };
  }
  return null;
}
