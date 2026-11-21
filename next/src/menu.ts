// The right-click ring and the orb's orient bar, in the prototype's look (`app/src/ui/ring.ts`, `look.ts`): round white buttons with an icon (the words are in the
// tooltip), a light shadow, a teal edge when pointed at, faded when they cannot be used, and a ring that unfolds from the click.
// It closes on Esc, on a click outside it and after one item is chosen.
import { settings } from "./settings.ts";
import { iconSvg } from "./icons.ts";

export interface MenuItem { id: string; label: string; icon: string; enabled?: boolean; note?: string; /** a bubble that opens a ring of its own */ children?: MenuItem[] }

const MS = 280, STAGGER = 22, GAP = 8; // the unfolding, and the room between neighbours
/** The one round button of every control over the view: white, a light grey edge, a soft shadow; pointing at it lights its edge teal. */
export function roundButton(o: { icon?: string; text?: string; size?: number; title?: string; live?: boolean; on?: boolean }): HTMLDivElement {
  const { size = 30, live = true, on = false } = o, u = settings.ui;
  const edge = on ? "#1ab8b3" : "#d6d7db", bg = on ? "#e8f7f6" : "#fff";
  const b = document.createElement("div");
  if (o.icon) b.innerHTML = iconSvg(o.icon); else if (o.text) b.textContent = o.text;
  if (o.title) b.title = o.title;
  b.style.cssText = `box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex:none;width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:1px solid ${edge};color:${u.text};font:700 12px ${u.font};cursor:${live ? "pointer" : "default"};opacity:${live ? 1 : 0.38};user-select:none;-webkit-user-select:none;touch-action:manipulation;box-shadow:0 1px 6px rgba(0,0,0,.14)`;
  if (live) { // (pointing at one lights its edge, the same everywhere)
    b.addEventListener("pointerenter", () => { b.style.borderColor = "#1ab8b3"; b.style.background = "#e8f7f6"; });
    b.addEventListener("pointerleave", () => { b.style.borderColor = edge; b.style.background = bg; });
  }
  return b;
}

const BACK: MenuItem = { id: "back", label: "Back", icon: "cross" };
const depth = (items: MenuItem[]): number => Math.max(items.length + 1, ...items.map((i) => (i.children ? depth(i.children) : 0)));

/** The ring (the prototype's): round buttons about the click, which unfold from it; a button with items of its own opens them as a new ring in the same place, with a way back. */
export function createMenu(host: HTMLElement, choose: (id: string) => void) {
  const SIZE = settings.planes.ringButtonPx;
  let root: HTMLElement | null = null, C = { x: 0, y: 0, R: 0 }, path: MenuItem[][] = [], shown: HTMLElement[] = [];
  const close = () => { root?.remove(); root = null; shown = []; document.removeEventListener("pointerdown", outside, true); };
  const outside = (e: Event) => { if (root && !root.contains(e.target as Node)) close(); };
  const spot = (a: number) => ({ left: Math.round(C.x + Math.cos(a) * C.R - SIZE / 2), top: Math.round(C.y + Math.sin(a) * C.R - SIZE / 2) });
  /** Show the ring at the end of the path, its buttons coming out of `from` (null: out of the click). */
  function draw(from: { left: number; top: number } | null) {
    const old = shown, items = path[path.length - 1]!, slots = path.length > 1 ? [BACK, ...items] : items, start = from ?? { left: Math.round(C.x - SIZE / 2), top: Math.round(C.y - SIZE / 2) };
    old.forEach((b) => { b.style.pointerEvents = "none"; b.style.transition = `left ${MS}ms,top ${MS}ms,opacity ${MS * 0.7}ms,transform ${MS}ms`; b.style.left = `${start.left}px`; b.style.top = `${start.top}px`; b.style.opacity = "0"; b.style.transform = "scale(.4)"; });
    setTimeout(() => old.forEach((b) => b.remove()), MS);
    shown = slots.map((it, k) => {
      const a = -Math.PI / 2 + (k / slots.length) * Math.PI * 2, live = it.enabled !== false, at = spot(a);
      const b = roundButton({ icon: it.icon, size: SIZE, title: it.note ? `${it.label} (${it.note})` : it.label, live });
      b.style.position = "absolute"; b.style.left = `${start.left}px`; b.style.top = `${start.top}px`; b.style.opacity = "0"; b.style.transform = "scale(.4)";
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      if (live) b.addEventListener("pointerup", (e) => {
        e.stopPropagation();
        if (it.id === "back") { path.pop(); draw(at); } else if (it.children) { path.push(it.children); draw(at); } else { close(); choose(it.id); }
      });
      root!.appendChild(b);
      requestAnimationFrame(() => { // (the buttons come out one after the other)
        const t = `${MS}ms cubic-bezier(.2,.8,.2,1) ${k * STAGGER}ms`;
        b.style.transition = `left ${t},top ${t},opacity ${MS}ms ${k * STAGGER}ms,transform ${t}`;
        b.style.left = `${at.left}px`; b.style.top = `${at.top}px`; b.style.opacity = live ? "1" : "0.38"; b.style.transform = "scale(1)";
      });
      return b;
    });
  }
  return {
    isOpen: () => root !== null,
    close,
    open(x: number, y: number, items: MenuItem[]) {
      close();
      const R = Math.max(SIZE + 14, ((SIZE + GAP) * depth(items)) / (2 * Math.PI)), m = R + SIZE / 2 + 6; // (far enough out that neighbours do not touch, the same for every ring; the whole ring is kept on the screen)
      C = { x: Math.min(Math.max(x, m), innerWidth - m), y: Math.min(Math.max(y, m), innerHeight - m), R };
      root = document.createElement("div");
      root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:20;user-select:none;-webkit-user-select:none";
      root.addEventListener("contextmenu", (e) => e.preventDefault());
      host.appendChild(root); path = [items]; draw(null);
      setTimeout(() => document.addEventListener("pointerdown", outside, true));
    },
  };
}

/** The bar at the top while the orb itself is being oriented: what it says, an apply check and a cancel cross (the prototype's). */
export function createOrientBar(host: HTMLElement, on: { apply(): void; cancel(): void }) {
  const bar = document.createElement("div");
  bar.style.cssText = `position:fixed;z-index:14;top:12px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;height:36px;padding:0 6px 0 14px;border-radius:18px;background:${settings.ui.pill};color:${settings.ui.pillText};font:600 13px ${settings.ui.font};box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap`;
  bar.addEventListener("pointerdown", (e) => e.stopPropagation());
  const t = document.createElement("span"); t.textContent = "Orient the mover"; bar.appendChild(t);
  const btn = (icon: string, title: string, fn: () => void) => { const b = roundButton({ icon, title, size: 26 }); b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); bar.appendChild(b); };
  btn("check", "Keep it where it is (Enter)", on.apply); btn("cross", "Put it back (Esc)", on.cancel);
  host.appendChild(bar);
  return { show(v: boolean) { bar.style.display = v ? "flex" : "none"; } };
}
