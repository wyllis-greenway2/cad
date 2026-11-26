// The marks on the sketch (`dec_marks_on_things`): each mark of `interaction/marks.ts` drawn standing on its part, a little up from it, with the one lock: closed and green (applied), open and yellow (offered, a click applies it), closed and red (it held a change back: it
// flashes). A constraint is a round chip, a number a pill (`chipdraw.ts`, the same ones the info bar has). It only draws and says what was pressed. A mark that would cover another is moved along until it does not.
import { createChips, STATE, type InfoHandlers } from "./chipdraw.ts";
import type { Mark } from "./interaction/marks.ts";
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";

export interface MarkHandlers extends InfoHandlers { /** an offered constraint was clicked: select the parts it is offered for, and apply it */ offer(id: string, over: string[]): void }
export interface PlacedMark { mark: Mark; x: number; y: number }

export function createMarkDraw(host: HTMLElement) {
  const layer = document.createElement("div"); layer.dataset.marks = ""; layer.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:7;pointer-events:none";
  const style = document.createElement("style"); style.textContent = "@keyframes mark-flash{0%,100%{opacity:1}50%{opacity:.25}}"; layer.append(style);
  host.appendChild(layer);
  let on: MarkHandlers | null = null, sig = ""; const els = new Map<string, HTMLElement>();
  const chips = createChips(() => on, () => { sig = ""; });
  const keyOf = (m: Mark) => `${m.id}|${m.over?.join(",") ?? ""}`;
  /** the lock on a chip's corner */
  const lock = (open: boolean, colour: string): HTMLElement => { const l = document.createElement("span"); l.innerHTML = iconSvg(open ? "unlock" : "lock"); l.dataset.lock = open ? "open" : "closed"; l.style.cssText = `position:absolute;right:-5px;bottom:-5px;width:14px;height:14px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#fff;color:${colour};pointer-events:none;transform:scale(.9)`; return l; };
  const make = (m: Mark): HTMLElement => {
    const colour = STATE[m.state], box = document.createElement("div"); box.style.cssText = "position:absolute;left:0;top:0;pointer-events:auto;will-change:transform"; box.dataset.mark = m.state;
    if (m.kind === "dimension") { box.append(chips.number(m, colour)); }
    else {
      const chip = m.state === "offer" ? chips.suggestion({ id: m.id, icon: m.icon, label: m.title, tone: "free" }, colour, () => on?.offer(m.id, m.over ?? [])) : chips.relation(m, colour);
      chip.title = m.state === "offer" ? `${m.title} (click to lock it)` : `${m.title} (click to unlock it)`; box.style.position = "absolute"; chip.style.position = "relative"; chip.append(lock(m.state === "offer", colour)); chip.style.overflow = "visible"; box.append(chip);
    }
    if (m.state === "refused") box.style.animation = "mark-flash .5s ease-in-out 3";
    for (const t of ["pointerdown", "click", "contextmenu"]) box.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu") e.preventDefault(); });
    return box;
  };
  return {
    /** Each picture: the marks to show, placed on the page (none: nothing), and what their buttons do. */
    show(list: PlacedMark[], h: MarkHandlers | null): void {
      if (h) on = h;
      const s = JSON.stringify(list.map((p) => ({ ...p.mark, alpha: 0, at: 0 })));
      if (s !== sig && !chips.editing()) {
        sig = s; chips.forget(); for (const e of els.values()) e.remove(); els.clear();
        for (const p of list) { const e = make(p.mark); els.set(keyOf(p.mark), e); layer.append(e); }
      }
      const M = settings.marks, seen = new Set<string>(), placed: { x: number; y: number; w: number; h: number }[] = [];
      for (const p of list) {
        const e = els.get(keyOf(p.mark)); if (!e) continue; seen.add(keyOf(p.mark));
        e.style.display = "block"; e.style.opacity = String(p.mark.alpha);
        const w = e.offsetWidth || 28, h = e.offsetHeight || 28; let x = p.x - w / 2, y = p.y - M.liftPx - h / 2;
        for (let tries = 0; tries < 8; tries++) { const hit = placed.find((b) => x < b.x + b.w + 4 && b.x < x + w + 4 && y < b.y + b.h + 4 && b.y < y + h + 4); if (!hit) break; x = hit.x + hit.w + 6; } // (a mark that would cover another stands beside it)
        placed.push({ x, y, w, h }); e.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      }
      for (const [k, e] of els) if (!seen.has(k)) e.style.display = "none";
    },
    startEdit: chips.startEdit, editing: chips.editing,
  };
}
