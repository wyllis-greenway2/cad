// The constraint bubbles (`in_058`..`in_061`, `in_118`): a small bubble sits ON the part it belongs to (the line, the vertex, between two lines, at the angle), not next to the
// pointer. A dimension is just its number and a little lock; any other constraint is its icon. Click the number to type a new one, click the lock to lock or unlock it, click the
// bubble to open it (an x to delete it appears; hovering also shows it) and click again to close it. Several constraints at one spot are laid side by side. The words are in tooltips.
import { roundedText } from "../shared/numbers.ts";
import type { Vec3 } from "../interaction/api.ts";
import type { Annotation } from "../interaction/annotations.ts";
import { iconKey, iconSvg } from "./icons.ts";
import { settings } from "../shared/settings.ts";
import { placeBubbles } from "../interaction/bubbleplace.ts";
import type { Memory } from "../interaction/bubbleplace.ts";

export interface BubbleHandlers {
  focus(id: string): void;
  remove(id: string): void;
  lock(id: string): void;
  /** a new number for a constraint */
  set(id: string, value: number): void;
  /** lock the measure of the selection at a number */
  measure(value: number, id?: string): void;
}

interface Entry { el: HTMLElement; sig: string; editing: boolean; a: Annotation; tinted: boolean; /** the thin line back to its spot, once it has moved far */ leader?: HTMLElement; /** where it is from the spot it belongs to, on its way to where it should stand */ off?: [number, number] }
/** A refused change while it flashes: how far through it is, what it would have broken (red, fading) and what tried it (it shakes). */
export interface Flash { t: number; victims: readonly string[]; culprits: readonly string[] }

export function createBubbles(host: HTMLElement, h: BubbleHandlers) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:8;font:13px system-ui,sans-serif;color:#2b2b2d;user-select:none;-webkit-user-select:none";
  host.appendChild(root);
  const entries = new Map<string, Entry>();
  const memory: Memory = new Map(); // where each bubble stood last time

  const make = (a: Annotation, e: Entry) => {
    const el = e.el;
    e.a = a;
    el.replaceChildren();
    el.title = `${a.label}${a.value !== null ? ` ${roundedText(a.value)} ${a.unit ?? ""}${a.locked ? " (locked)" : a.readOnly ? " (measured: it belongs to the body)" : " (measured: click the number to type one and lock it)"}` : ""}${a.broken ? ": a part it used is gone" : ""}`;
    el.style.cssText = `position:absolute;left:0;top:0;display:flex;align-items:center;gap:3px;height:26px;box-sizing:border-box;padding:0 7px;border-radius:13px;background:#fff;border:1px solid ${a.broken ? "#d33" : a.open ? "#e0a82e" : "#d6d7db"};box-shadow:0 1px 6px rgba(0,0,0,.12);cursor:${a.relationId ? "pointer" : "default"};white-space:nowrap`;
    const relation = a.relationId;
    if (a.value !== null) {
      if (a.symbol) { const sym = document.createElement("span"); sym.textContent = a.symbol; sym.style.cssText = "font-weight:600;opacity:.6"; el.appendChild(sym); } // Ø or R: what the number is the size of
      const num = document.createElement("span");
      num.textContent = roundedText(a.value);
      num.style.cssText = `font-weight:600;${a.editable ? "cursor:text;" : ""}`;
      if (a.editable) {
        num.addEventListener("click", (ev) => { ev.stopPropagation(); edit(a, e, num); });
        num.title = "Type a new number";
      }
      el.appendChild(num);
      const lock = document.createElement("span");
      lock.innerHTML = iconSvg(a.locked ? "lock" : "unlock"); // (a closed padlock when locked, an open one when it is only a measurement, `in_290`)
      lock.style.cssText = `display:inline-flex;padding:2px;cursor:${a.editable ? "pointer" : "default"};opacity:${a.locked ? 1 : 0.8};color:${a.locked ? "#1a8f8b" : "inherit"}`;
      lock.title = a.locked ? "Locked: click to unlock (keep it as a measurement)" : a.readOnly ? "A measurement of the body: it cannot be locked" : "Measurement only: click to lock at this number";
      if (a.editable) lock.addEventListener("click", (ev) => { ev.stopPropagation(); relation ? h.lock(relation) : h.measure(a.value!, a.measureId); });
      el.appendChild(lock);
    } else {
      const ic = document.createElement("span");
      ic.innerHTML = iconSvg(iconKey(a.kind));
      ic.style.cssText = "display:inline-flex";
      el.appendChild(ic);
    }
    if (relation) {
      const x = document.createElement("span");
      x.innerHTML = iconSvg("cross");
      x.title = "Delete this constraint";
      x.style.cssText = `display:${a.open ? "inline-flex" : "none"};padding:2px;border-radius:9px;cursor:pointer`;
      x.dataset.x = "1";
      x.addEventListener("click", (ev) => { ev.stopPropagation(); h.remove(relation); });
      el.appendChild(x);
    }
  };

  /** The number becomes a box you type in; Enter keeps it, Escape or clicking away puts it back. */
  const edit = (a: Annotation, e: Entry, num: HTMLElement) => {
    e.editing = true;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(Math.round((a.value ?? 0) * 100) / 100);
    input.style.cssText = "width:64px;font:600 13px system-ui,sans-serif;border:none;outline:none;background:transparent;text-align:right";
    num.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      e.editing = false;
      const v = Number(input.value);
      if (keep && Number.isFinite(v) && (v > 0 || (a.measureId !== undefined && v >= 0))) (a.relationId ? h.set(a.relationId, v) : h.measure(v, a.measureId));
      make(a, e); // back to showing the number (a refused change leaves the old one; an accepted one is redrawn with the new)
    };
    input.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") finish(true); else if (ev.key === "Escape") finish(false); });
    input.addEventListener("blur", () => finish(false));
    input.addEventListener("click", (ev) => ev.stopPropagation());
  };

  return {
    /** The boxes of the bubbles that are shown and take clicks (what the suggestion row gives way to, `in_264`). */
    rects(): DOMRect[] { return [...entries.values()].filter((e) => e.el.style.pointerEvents !== "none").map((e) => e.el.getBoundingClientRect()); },
    /** `project`: a point of the scene to a point on the page, in pixels. Called every frame the view changes. */
    /** Returns whether a bubble is still sliding to its place (the page should draw another frame). `before`: boxes of what comes before the bubbles, in page pixels. */
    update(list: Annotation[], project: (p: Vec3) => [number, number], flash: Flash | null = null, avoid: { segs: [Vec3, Vec3][]; pts: Vec3[] } = { segs: [], pts: [] }, before: [number, number, number, number][] = []): boolean {
      const seen = new Set<string>();
      const placed: { a: Annotation; e: Entry; x: number; y: number }[] = [];
      for (const a of list) {
        seen.add(a.id);
        let e = entries.get(a.id);
        const sig = JSON.stringify([a.kind, a.value, a.unit, a.locked, a.editable, a.readOnly, a.broken, a.open, a.symbol]);
        if (!e) {
          const entry: Entry = { el: document.createElement("div"), sig: "", editing: false, a, tinted: false };
          // listeners on the bubble itself are added once (the contents are rebuilt when it changes, the bubble is not), and read the current annotation
          entry.el.addEventListener("click", () => { if (entry.a.relationId) h.focus(entry.a.relationId); }); // click the bubble: open it; click again: close it
          entry.el.addEventListener("pointerenter", () => { entry.el.style.zIndex = "2"; const x = entry.el.querySelector<HTMLElement>("[data-x]"); if (x) x.style.display = "inline-flex"; }); // (raised, so the ✕ it grows is not covered by a neighbouring bubble)
          entry.el.addEventListener("pointerleave", () => { entry.el.style.zIndex = ""; const x = entry.el.querySelector<HTMLElement>("[data-x]"); if (x && !entry.a.open) x.style.display = "none"; });
          root.appendChild(entry.el);
          entries.set(a.id, entry);
          e = entry;
        }
        if (e.sig !== sig && !e.editing) { e.sig = sig; make(a, e); }
        const [x, y] = project(a.at);
        placed.push({ a, e, x, y });
      }
      for (const [id, e] of entries) if (!seen.has(id) && !e.editing) { e.el.remove(); e.leader?.remove(); entries.delete(id); }
      // where each stands (`bubbleplace.ts`: clear of lines, corners and what comes first; keeps its place while that is clear), and the way there is eased, so a bubble that has to give way slides
      const put = placeBubbles(
        placed.map((p) => ({ id: p.a.id, x: p.x, y: p.y, w: p.e.el.offsetWidth || 40 })),
        { lines: avoid.segs.map(([p, q]) => [project(p), project(q)] as [[number, number], [number, number]]), dots: avoid.pts.map((p) => project(p)), rects: before },
        memory,
      );
      let moving = false;
      placed.forEach((q) => {
        const to = put.find((u) => u.id === q.a.id)!;
        const target: [number, number] = [to.left - q.x, to.top - q.y];
        const e = q.e;
        const now = e.off ?? target;
        const next: [number, number] = Math.hypot(target[0] - now[0], target[1] - now[1]) < 0.6 ? target : [now[0] + (target[0] - now[0]) * 0.4, now[1] + (target[1] - now[1]) * 0.4];
        if (next !== target) moving = true;
        e.off = next;
        // a refused change: what it would have broken goes mild red and fades back; what tried it shakes for a moment
        let dx = 0;
        if (flash && flash.victims.includes(q.a.id)) { const k = 1 - flash.t; e.el.style.background = `rgb(255, ${Math.round(255 - 110 * k)}, ${Math.round(255 - 110 * k)})`; e.el.style.borderColor = `rgba(220, 70, 70, ${k})`; e.tinted = true; }
        else if (e.tinted) { e.el.style.background = "#fff"; e.el.style.borderColor = q.a.open ? "#e0a82e" : "#d6d7db"; e.tinted = false; }
        if (flash && flash.culprits.includes(q.a.id)) { const phase = (flash.t * settings.flash.ms) / settings.flash.shakeMs; if (phase < 1) dx = Math.sin(phase * Math.PI * 6) * 7 * (1 - phase); }
        e.el.style.transform = `translate(${Math.round(q.x + next[0] + dx)}px, ${Math.round(q.y + next[1])}px)`;
        // under something that comes first with no room to go: faint, and clicks go through (`in_260`)
        e.el.style.opacity = to.faded ? "0.3" : "";
        e.el.style.pointerEvents = to.faded ? "none" : "";
        // moved far from its spot: a thin line back to it, so it is still clear what it belongs to
        const far = Math.hypot(next[0], next[1]) > 44;
        if (far && !e.leader) { e.leader = document.createElement("div"); e.leader.style.cssText = "position:fixed;left:0;top:0;height:1px;background:rgba(80,84,92,.55);transform-origin:0 0;pointer-events:none"; root.insertBefore(e.leader, e.el); }
        if (e.leader) {
          if (!far) e.leader.style.display = "none";
          else {
            const [bx, by] = [q.x + next[0] + dx + (e.el.offsetWidth || 40) / 2, q.y + next[1] + 13];
            const len = Math.hypot(bx - q.x, by - q.y);
            e.leader.style.display = "block";
            e.leader.style.width = `${Math.round(len)}px`;
            e.leader.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) rotate(${Math.atan2(by - q.y, bx - q.x)}rad)`;
          }
        }
      });
      return moving;
    },
  };
}
