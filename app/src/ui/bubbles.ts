// The constraint bubbles (`in_058`..`in_061`, `in_118`): a small bubble sits ON the part it belongs to (the line, the vertex, between two lines, at the angle), not next to the
// pointer. A dimension is just its number and a little lock; any other constraint is its icon. Click the number to type a new one, click the lock to lock or unlock it, click the
// bubble to open it (an x to delete it appears; hovering also shows it) and click again to close it. Several constraints at one spot are laid side by side. The words are in tooltips.
import type { Vec3 } from "../interaction/api.ts";
import type { Annotation } from "../interaction/annotations.ts";
import { iconKey, iconSvg } from "./icons.ts";
import { settings } from "../shared/settings.ts";

export interface BubbleHandlers {
  focus(id: string): void;
  remove(id: string): void;
  lock(id: string): void;
  /** a new number for a constraint */
  set(id: string, value: number): void;
  /** lock the measure of the selection at a number */
  measure(value: number): void;
}
const fmt = (v: number) => String(Math.round(v * 100) / 100);
const GAP = 4;
const CLUSTER_PX = 34; // bubbles closer than this on the screen are laid side by side

interface Entry { el: HTMLElement; sig: string; editing: boolean; a: Annotation; tinted: boolean }
/** A refused change while it flashes: how far through it is, what it would have broken (red, fading) and what tried it (it shakes). */
export interface Flash { t: number; victims: readonly string[]; culprits: readonly string[] }

export function createBubbles(host: HTMLElement, h: BubbleHandlers) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:8;font:13px system-ui,sans-serif;color:#2b2b2d;user-select:none;-webkit-user-select:none";
  host.appendChild(root);
  const entries = new Map<string, Entry>();

  const make = (a: Annotation, e: Entry) => {
    const el = e.el;
    e.a = a;
    el.replaceChildren();
    el.title = `${a.label}${a.value !== null ? ` ${fmt(a.value)} ${a.unit ?? ""}${a.locked ? " (locked)" : a.readOnly ? " (measured: it belongs to the body)" : " (measured: click the number to type one and lock it)"}` : ""}${a.broken ? ": a part it used is gone" : ""}`;
    el.style.cssText = `position:absolute;left:0;top:0;display:flex;align-items:center;gap:3px;height:26px;box-sizing:border-box;padding:0 7px;border-radius:13px;background:#fff;border:1px solid ${a.broken ? "#d33" : a.open ? "#e0a82e" : "#d6d7db"};box-shadow:0 1px 6px rgba(0,0,0,.12);cursor:${a.relationId ? "pointer" : "default"};white-space:nowrap`;
    const relation = a.relationId;
    if (a.value !== null) {
      if (a.symbol) { const sym = document.createElement("span"); sym.textContent = a.symbol; sym.style.cssText = "font-weight:600;opacity:.6"; el.appendChild(sym); } // Ø or R: what the number is the size of
      const num = document.createElement("span");
      num.textContent = fmt(a.value);
      num.style.cssText = `font-weight:600;${a.editable ? "cursor:text;" : ""}`;
      if (a.editable) {
        num.addEventListener("click", (ev) => { ev.stopPropagation(); edit(a, e, num); });
        num.title = "Type a new number";
      }
      el.appendChild(num);
      const lock = document.createElement("span");
      lock.innerHTML = iconSvg("lock");
      lock.style.cssText = `display:inline-flex;padding:2px;cursor:${a.editable ? "pointer" : "default"};opacity:${a.locked ? 1 : 0.35}`;
      lock.title = a.locked ? "Locked: click to unlock (keep it as a measurement)" : a.readOnly ? "A measurement of the body: it cannot be locked" : "Measurement only: click to lock at this number";
      if (a.editable) lock.addEventListener("click", (ev) => { ev.stopPropagation(); relation ? h.lock(relation) : h.measure(a.value!); });
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
      if (keep && Number.isFinite(v) && v > 0) (a.relationId ? h.set(a.relationId, v) : h.measure(v));
      make(a, e); // back to showing the number (a refused change leaves the old one; an accepted one is redrawn with the new)
    };
    input.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") finish(true); else if (ev.key === "Escape") finish(false); });
    input.addEventListener("blur", () => finish(false));
    input.addEventListener("click", (ev) => ev.stopPropagation());
  };

  return {
    /** `project`: a point of the scene to a point on the page, in pixels. Called every frame the view changes. */
    update(list: Annotation[], project: (p: Vec3) => [number, number], flash: Flash | null = null) {
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
      for (const [id, e] of entries) if (!seen.has(id) && !e.editing) { e.el.remove(); entries.delete(id); }
      // bubbles on top of each other are laid side by side around their common spot
      const used = new Set<number>();
      placed.forEach((p, i) => {
        if (used.has(i)) return;
        const group = [i];
        placed.forEach((q, j) => { if (j !== i && !used.has(j) && Math.hypot(q.x - p.x, q.y - p.y) < CLUSTER_PX) group.push(j); });
        group.forEach((j) => used.add(j));
        const widths = group.map((j) => placed[j]!.e.el.offsetWidth || 40);
        const total = widths.reduce((s, w) => s + w, 0) + GAP * (group.length - 1);
        const cx = group.reduce((s, j) => s + placed[j]!.x, 0) / group.length;
        const cy = group.reduce((s, j) => s + placed[j]!.y, 0) / group.length;
        let left = cx - total / 2;
        group.forEach((j, k) => {
          const q = placed[j]!;
          // a refused change: what it would have broken goes mild red and fades back; what tried it shakes for a moment
          let dx = 0;
          const e = q.e;
          if (flash && flash.victims.includes(q.a.id)) { const k = 1 - flash.t; e.el.style.background = `rgb(255, ${Math.round(255 - 110 * k)}, ${Math.round(255 - 110 * k)})`; e.el.style.borderColor = `rgba(220, 70, 70, ${k})`; e.tinted = true; }
          else if (e.tinted) { e.el.style.background = "#fff"; e.el.style.borderColor = q.a.open ? "#e0a82e" : "#d6d7db"; e.tinted = false; }
          if (flash && flash.culprits.includes(q.a.id)) { const phase = (flash.t * settings.flash.ms) / settings.flash.shakeMs; if (phase < 1) dx = Math.sin(phase * Math.PI * 6) * 7 * (1 - phase); }
          q.e.el.style.transform = `translate(${Math.round(left + dx)}px, ${Math.round(cy - 13)}px)`;
          left += widths[k]! + GAP;
        });
      });
    },
  };
}
