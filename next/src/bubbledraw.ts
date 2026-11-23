// The bubbles on the page (`q_lean_ui`): one layer that draws the descriptions of `interaction/bubbles.ts` as small white pills standing on the part they belong to, and nothing else. Where each stands on the page is
// `bubbleplace.ts`'s (the prototype's: up and to the right, out of the way of lines, corners and what comes first, side by side when on one spot). A number is typed in place; a constraint opens to show a cross that deletes it.
import type { Bubble } from "./interaction/bubbles.ts";
import { placeBubbles, type Memory, type Obstacles } from "./interaction/bubbleplace.ts";
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";

export interface BubbleHandlers { set(id: string, value: number): void; remove(id: string): void }
export interface Placed { bubble: Bubble; x: number; y: number }
const TONE = { rest: "#d6d7db", refused: "#e46a6a", applied: "#3fae6a" } as const;

export function createBubbleLayer(host: HTMLElement, h: BubbleHandlers) {
  const root = document.createElement("div");
  root.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;z-index:8;font:13px ${settings.ui.font};color:${settings.ui.text};user-select:none;-webkit-user-select:none`;
  const style = document.createElement("style");
  style.textContent = "@keyframes bubble-flash{0%,100%{box-shadow:0 1px 3px rgba(0,0,0,.18)}50%{box-shadow:0 0 0 4px rgba(228,106,106,.45)}}";
  host.append(style, root);
  const els = new Map<string, { el: HTMLElement; sig: string; open: boolean; editing: boolean }>(), memory: Memory = new Map();
  const widthOf = (b: Bubble) => (b.kind === "dimension" ? 22 + (b.symbol && b.symbol !== "°" ? 10 : 0) + (b.text ?? "").length * 8 + (b.symbol === "°" ? 8 : 0) : 30);

  function fill(b: Bubble, e: { el: HTMLElement; sig: string; open: boolean; editing: boolean }): void {
    const el = e.el;
    el.replaceChildren(); el.title = b.title;
    el.style.cssText = `position:absolute;left:0;top:0;box-sizing:border-box;height:26px;display:flex;align-items:center;gap:4px;padding:0 8px;border-radius:13px;background:#fff;border:1px solid ${e.open ? "#e0a82e" : TONE[b.tone]};box-shadow:0 1px 3px rgba(0,0,0,.18);cursor:pointer;white-space:nowrap;${b.tone === "refused" ? "animation:bubble-flash .5s ease-in-out 3;" : ""}`;
    if (b.kind === "dimension") {
      if (b.symbol && b.symbol !== "°") { const s = document.createElement("span"); s.textContent = b.symbol; s.style.cssText = "font-weight:600;opacity:.6"; el.append(s); }
      const num = document.createElement("span"); num.textContent = b.text ?? ""; num.style.cssText = "font-weight:600;cursor:text"; num.title = "Type a new number";
      num.addEventListener("click", (ev) => { ev.stopPropagation(); edit(b, e, num); });
      el.append(num);
      if (b.symbol === "°") { const s = document.createElement("span"); s.textContent = "°"; s.style.cssText = "font-weight:600;opacity:.6;margin-left:-3px"; el.append(s); }
    } else { const i = document.createElement("span"); i.innerHTML = iconSvg(b.icon); i.style.cssText = "display:flex"; el.append(i); }
    if (e.open) { const x = document.createElement("span"); x.innerHTML = iconSvg("cross"); x.title = "Delete"; x.style.cssText = "display:flex;cursor:pointer"; x.addEventListener("click", (ev) => { ev.stopPropagation(); h.remove(b.id); }); el.append(x); }
  }
  function edit(b: Bubble, e: { el: HTMLElement; sig: string; open: boolean; editing: boolean }, num: HTMLElement): void {
    const input = document.createElement("input");
    input.value = b.text ?? ""; input.style.cssText = `width:${Math.max(4, (b.text ?? "").length + 1)}ch;font:inherit;font-weight:600;border:0;outline:0;background:transparent;padding:0`;
    num.replaceWith(input); input.focus(); input.select(); e.editing = true;
    const done = (commit: boolean) => { if (!e.editing) return; e.editing = false; const v = Number(input.value.trim()); if (commit && input.value.trim() !== "" && isFinite(v)) h.set(b.id, v); e.sig = ""; /* (drawn again, with the number, whether or not it changed) */ };
    input.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") done(true); else if (ev.key === "Escape") done(false); });
    input.addEventListener("blur", () => done(false));
    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  }

  return {
    /** Each picture: the bubbles to show, where the part each belongs to is on the page, and what they keep clear of. */
    show(items: readonly Placed[], obs: Obstacles): void {
      const seen = new Set<string>();
      const put = new Map(placeBubbles(items.map((p) => ({ id: p.bubble.id, x: p.x, y: p.y, w: widthOf(p.bubble) })), obs, memory).map((q) => [q.id, q] as const));
      for (const { bubble: b } of items) {
        seen.add(b.id);
        let e = els.get(b.id);
        if (!e) {
          const el = document.createElement("div"); el.dataset.bubble = b.id; e = { el, sig: "", open: false, editing: false }; els.set(b.id, e); root.append(el);
          el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
          el.addEventListener("click", () => { const q = els.get(b.id)!; if (b.kind === "dimension") return; q.open = !q.open; q.sig = ""; });
        }
        const sig = `${b.tone}|${b.text ?? b.icon}|${e.open}`;
        if (sig !== e.sig && !e.editing) { e.sig = sig; fill(b, e); }
        const q = put.get(b.id)!;
        e.el.style.transform = `translate(${Math.round(q.left)}px,${Math.round(q.top)}px)`; e.el.style.opacity = q.faded ? "0.3" : "1"; e.el.style.pointerEvents = q.faded ? "none" : "auto";
      }
      for (const [id, e] of els) if (!seen.has(id)) { e.el.remove(); els.delete(id); }
    },
    editing: (): boolean => [...els.values()].some((e) => e.editing),
    /** The rectangles the bubbles stand in (the page's pixels), for what must keep clear of them. */
    rects: (): [number, number, number, number][] => [...els.values()].map((e) => { const r = e.el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom] as [number, number, number, number]; }),
  };
}
