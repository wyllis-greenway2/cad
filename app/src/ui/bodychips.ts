// The eye on a body (`dec_hidden_bodies`, `in_489`): while the pointer is over a body on the screen, a small eye fades in on it; one click hides the body, or, when it is hidden, brings it back. Like the icons on the
// sheets (`sheetchips.ts`) it only shows and reports the click. A body that is shown has its eye only while the pointer is over it; one that is hidden too (the body itself takes no pick at all).
import { iconSvg } from "./icons.ts";
import type { Vec3 } from "../interaction/api.ts";

export interface BodyEye { ref: string; hidden: boolean; /** the body is selected: its play button shows */ selected?: true; /** a body hooked up to an animation: its play (or pause) button */ play?: "play" | "pause"; /** the eight corners of the body's box */ corners: Vec3[] }

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
  const pool = new Map<string, { box: HTMLDivElement; sig: string; play: HTMLDivElement; playSig: string }>();
  const make = (ref: string) => {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:0;top:0;display:none;z-index:6;width:30px;height:30px;box-sizing:border-box;border-radius:15px;background:#fff;border:1px solid #8a8f98;color:#2b2b2d;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:opacity .2s";
    box.addEventListener("pointerdown", (e) => e.stopPropagation());
    box.addEventListener("click", (e) => { e.stopPropagation(); run(`body:eye:${ref}`); });
    host.appendChild(box);
    const play = document.createElement("div"); // (the play or pause button of a body that is hooked up to an animation, beside its eye, `in_876`)
    play.style.cssText = box.style.cssText;
    play.addEventListener("pointerdown", (e) => e.stopPropagation());
    play.addEventListener("click", (e) => { e.stopPropagation(); run(`body:play:${ref}`); });
    host.appendChild(play);
    return { box, sig: "", play, playSig: "" };
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
        if (b.play) {
          if (b.play !== chip.playSig) { chip.playSig = b.play; chip.play.innerHTML = iconSvg(b.play === "pause" ? "pause" : "play"); chip.play.title = b.play === "pause" ? "Pause the animation" : "Play the animation"; }
          const beside = b.hidden || !quiet ? 34 : 0; // (a shown body has no eye now, `in_697`: the play button takes its place)
          chip.play.style.transform = `translate(${Math.round(at[0] - 15 + beside)}px, ${Math.round(at[1] - 15)}px)`;
          chip.play.style.display = "flex";
          const showPlay = !!b.selected || chip.play.matches(":hover") || b.play === "pause"; // (shown for a body that is selected, `in_957`, not for one the pointer is over; a motion that plays keeps its pause button)
          chip.play.style.opacity = showPlay ? "1" : "0";
          chip.play.style.pointerEvents = showPlay ? "auto" : "none";
        } else { chip.play.style.display = "none"; chip.playSig = ""; }
      }
      for (const [ref, chip] of pool) if (!seen.has(ref)) { chip.box.remove(); chip.play.remove(); pool.delete(ref); }
    },
  };
}
