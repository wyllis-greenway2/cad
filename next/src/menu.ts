// The right-click ring and the cut plane's little controls, in the prototype's look (`app/src/ui/ring.ts`, `look.ts`): round white buttons with an icon (the words are in the
// tooltip), a light shadow, a teal edge when pointed at, faded when they cannot be used, and a ring that unfolds from the click.
// It closes on Esc, on a click outside it and after one item is chosen.
import { settings } from "./settings.ts";
import { iconSvg } from "./icons.ts";

export interface MenuItem { id: string; label: string; icon: string; enabled?: boolean; note?: string }

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

export function createMenu(host: HTMLElement, choose: (id: string) => void) {
  const SIZE = settings.planes.ringButtonPx;
  let el: HTMLElement | null = null;
  const close = () => { el?.remove(); el = null; document.removeEventListener("pointerdown", outside, true); };
  const outside = (e: Event) => { if (el && !el.contains(e.target as Node)) close(); };
  return {
    isOpen: () => el !== null,
    close,
    open(x: number, y: number, items: MenuItem[]) {
      close();
      const R = Math.max(SIZE + 14, ((SIZE + GAP) * (items.length + 1)) / (2 * Math.PI)), m = R + SIZE / 2 + 6; // (far enough out that neighbours do not touch)
      const cx = Math.min(Math.max(x, m), innerWidth - m), cy = Math.min(Math.max(y, m), innerHeight - m); // (the whole ring is kept on the screen)
      const root = document.createElement("div");
      root.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;z-index:20;user-select:none;-webkit-user-select:none`;
      root.addEventListener("contextmenu", (e) => e.preventDefault());
      items.forEach((it, k) => {
        const a = -Math.PI / 2 + (k / items.length) * Math.PI * 2, live = it.enabled !== false;
        const b = roundButton({ icon: it.icon, size: SIZE, title: it.note ? `${it.label} (${it.note})` : it.label, live });
        const at = { left: Math.round(cx + Math.cos(a) * R - SIZE / 2), top: Math.round(cy + Math.sin(a) * R - SIZE / 2) };
        b.style.position = "absolute"; b.style.left = `${Math.round(cx - SIZE / 2)}px`; b.style.top = `${Math.round(cy - SIZE / 2)}px`; b.style.opacity = "0"; b.style.transform = "scale(.4)";
        b.addEventListener("pointerdown", (e) => e.stopPropagation());
        if (live) b.addEventListener("pointerup", (e) => { e.stopPropagation(); close(); choose(it.id); });
        root.appendChild(b);
        requestAnimationFrame(() => { // (the buttons come out of the click's place, one after the other)
          b.style.transition = `left ${MS}ms cubic-bezier(.2,.8,.2,1) ${k * STAGGER}ms,top ${MS}ms cubic-bezier(.2,.8,.2,1) ${k * STAGGER}ms,opacity ${MS}ms ${k * STAGGER}ms,transform ${MS}ms cubic-bezier(.2,.8,.2,1) ${k * STAGGER}ms`;
          b.style.left = `${at.left}px`; b.style.top = `${at.top}px`; b.style.opacity = live ? "1" : "0.38"; b.style.transform = "scale(1)";
        });
      });
      el = root; host.appendChild(root);
      setTimeout(() => document.addEventListener("pointerdown", outside, true));
    },
  };
}

export interface CutView { id: string; anchor: [number, number] | null; on: boolean; temp: boolean; orienting: boolean }
/** The little controls of a selected cut plane: round buttons in a row (the prototype's sheet chips). Moving it is the orb's (orb.ts). */
export function createCutUi(host: HTMLElement, on: { toggle(id: string): void; orient(id: string): void; away(id: string): void; sketch(id: string): void }) {
  const bar = document.createElement("div"); bar.style.cssText = "position:fixed;z-index:12;display:none;gap:6px;flex-wrap:wrap;max-width:204px;transform:translate(10px,10px)"; host.appendChild(bar);
  bar.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  let built = "";
  const add = (o: { icon?: string; text?: string; title: string; on?: boolean }, fn: () => void) => { const b = roundButton({ ...o, size: 30 }); b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); bar.appendChild(b); };
  return {
    update(v: CutView | null) {
      if (!v || !v.anchor) { bar.style.display = "none"; built = ""; return; }
      const sig = `${v.id}${v.on}${v.temp}${v.orienting}`;
      if (sig !== built) {
        built = sig; bar.innerHTML = "";
        add({ icon: v.on ? "eye" : "eyeOff", title: v.on ? "It cuts: switch it off" : "It does not cut: switch it on", on: v.on }, () => on.toggle(v.id));
        if (!v.temp) {
          add({ icon: "orient", title: v.orienting ? "Put the mover away" : "Orient: show the mover", on: v.orienting }, () => on.orient(v.id));
          add({ icon: "sheetPlain", title: "Make a sketch plane here" }, () => on.sketch(v.id));
          add({ icon: "trash", title: "Put the cut plane away" }, () => on.away(v.id));
        }
      }
      bar.style.display = "flex"; bar.style.left = `${v.anchor[0]}px`; bar.style.top = `${v.anchor[1]}px`;
    },
  };
}

/** The little info bubbles of the arrows that are chosen: they stay while the arrow is chosen and follow it. */
export function createBubbles(host: HTMLElement) {
  const pool: HTMLElement[] = [];
  const make = () => { const el = document.createElement("div"); el.style.cssText = `position:fixed;z-index:13;display:none;height:26px;box-sizing:border-box;padding:0 8px;line-height:24px;border-radius:13px;background:#fff;border:1px solid #1ab8b3;box-shadow:0 1px 6px rgba(0,0,0,.12);font:13px ${settings.ui.font};color:${settings.ui.text};white-space:nowrap;pointer-events:none;transform:translate(12px,-34px)`; host.appendChild(el); pool.push(el); return el; };
  return {
    update(list: Array<{ at: [number, number]; text: string }>) {
      while (pool.length < list.length) make();
      pool.forEach((el, i) => { const b = list[i]; if (!b) { el.style.display = "none"; return; } el.style.display = "block"; el.style.left = `${Math.round(b.at[0])}px`; el.style.top = `${Math.round(b.at[1])}px`; if (el.textContent !== b.text) el.textContent = b.text; });
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
