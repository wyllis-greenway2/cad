// The eye on a hidden body (`dec_hidden_bodies`, `in_489`): a body that is hidden takes no pick, so it cannot be selected and its eye cannot be in the helpful bar (`suggest.ts`, `in_1160`): while the pointer is over it on the screen the eye fades in on it, and one click brings it back.
// The eye of a body that is shown, its play button and the icon of its constraints are in the bar. Like the icons on the sheets (`sheetchips.ts`) it only shows and reports the click.
import { iconSvg } from "./icons.ts";
import type { Vec3 } from "../interaction/api.ts";

export interface BodyEye { ref: string; hidden: boolean; /** the body is selected: its play button shows */ selected?: true; /** a body hooked up to an animation: its play (or pause) button */ play?: "play" | "pause"; /** the body is selected: the icon of its constraints shows (`in_1157`) */ chosen?: true; /** the constraints of the body are shown */ cons?: true; /** the eight corners of the body's box */ corners: Vec3[] }

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

export function createBodyChips(host: HTMLElement, run: (id: string) => void) {
  const pool = new Map<string, { box: HTMLDivElement; sig: string }>();
  const make = (ref: string) => {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:0;top:0;display:none;z-index:6;width:30px;height:30px;box-sizing:border-box;border-radius:15px;background:#fff;border:1px solid #8a8f98;color:#2b2b2d;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:opacity .2s";
    box.addEventListener("pointerdown", (e) => e.stopPropagation());
    box.addEventListener("click", (e) => { e.stopPropagation(); run(`body:eye:${ref}`); });
    host.appendChild(box);
    return { box, sig: "" };
  };
  return {
    /** The rects the eyes fill that are showing (the bubbles keep off them). */
    rects(): DOMRect[] { return [...pool.values()].filter((p) => p.box.style.display !== "none" && p.box.style.opacity !== "0").map((p) => p.box.getBoundingClientRect()); },
    /**
     * `bodies` with each corner's page position (`screen`), and the pointer's page position (or null). `quiet`: a tool or an operation is in use, so the eye of a shown body stays away (it would be in the way of
     * the drawing); the eye of a hidden body still shows, to bring it back.
     */
    update(bodies: BodyEye[], screen: (q: Vec3) => [number, number] | null, pointer: [number, number] | null, quiet: boolean): void {
      const seen = new Set<string>();
      for (const b of bodies) {
        const pts = b.corners.map(screen);
        if (pts.some((q) => !q)) continue;
        const px = pts as [number, number][];
        seen.add(b.ref);
        const chip = pool.get(b.ref) ?? make(b.ref);
        pool.set(b.ref, chip);
        const sig = String(b.hidden);
        if (sig !== chip.sig) { chip.sig = sig; chip.box.innerHTML = iconSvg(b.hidden ? "eyeOff" : "eye"); chip.box.title = b.hidden ? "Hidden: show this body" : "Hide this body"; }
        // above the body's top edge on the screen, not on the body: a click on the body (to select it) is never taken by the eye
        const h = hull(px);
        const top = h.reduce((a, q) => (q[1] < a[1] ? q : a), h[0]!);
        const at: [number, number] = [top[0], top[1] - 24];
        chip.box.style.transform = `translate(${Math.round(at[0] - 15)}px, ${Math.round(at[1] - 15)}px)`;
        chip.box.style.display = "flex";
        const near = !!pointer && Math.hypot(pointer[0] - at[0], pointer[1] - at[1]) < 30; // (the way up to the eye from the body counts too)
        const over = !!pointer && (inside(pointer, h) || near || chip.box.matches(":hover"));
        const show = over && (b.hidden || !quiet);
        chip.box.style.opacity = show ? "1" : "0";
        chip.box.style.pointerEvents = show ? "auto" : "none";
      }
      for (const [ref, chip] of pool) if (!seen.has(ref)) { chip.box.remove(); pool.delete(ref); }
    },
  };
}
