// The info bar on the page (`dec_three_surfaces`, `in_1598`, `in_1601`): one row standing below its subject and a little to its left (the old app's place: 67 px under it, 6 px before it). The left of it is what is so: a constraint is a round button (a click takes
// it away), a number is a pill with its padlock (a click on the number types a new one; the padlock locks it at what it measures or lets it go; digits typed with its subject selected go to it, `startEdit`). The right, in a dashed teal outline, is what could be added (a click
// applies it). It only draws `interaction/infobar.ts`'s descriptions and says what was pressed. Words are tooltips.
import type { Info } from "./interaction/infobar.ts";
import { settings } from "./settings.ts";
import { createChips, type InfoHandlers } from "./chipdraw.ts";
export type { InfoHandlers } from "./chipdraw.ts";

export function createInfoBar(host: HTMLElement) {
  const el = document.createElement("div"); el.dataset.info = "";
  el.style.cssText = `position:fixed;left:0;top:0;display:none;z-index:8;align-items:center;gap:6px;padding:4px;border-radius:18px;background:rgba(255,255,255,.92);border:1px solid #1ab8b3;box-shadow:0 1px 6px rgba(0,0,0,.12);font:12px ${settings.ui.font};color:${settings.ui.text};user-select:none;-webkit-user-select:none`;
  for (const t of ["pointerdown", "click", "contextmenu"]) el.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu") e.preventDefault(); });
  host.appendChild(el);
  let sig = "", on: InfoHandlers | null = null;
  const chips = createChips(() => on, () => { sig = ""; });
  return {
    /** Each picture: what the bar says (null: no bar), where on the page it stands from, and what its buttons do. Returns the box it takes. */
    show(info: Info | null, at: [number, number] | null, h: InfoHandlers | null, vw: number, vh: number): [number, number, number, number] | null {
      if (h) on = h; // (kept while a number is being typed, when the subject is not asked for)
      if (!info || !at || (!info.facts.length && !info.suggestions.length)) { if (!chips.editing()) { el.style.display = "none"; if (sig) { el.replaceChildren(); chips.forget(); sig = ""; } } return null; }
      const s = JSON.stringify(info);
      if (s !== sig && !chips.editing()) {
        sig = s; chips.forget(); const kids: HTMLElement[] = info.facts.map((f) => (f.kind === "dimension" ? chips.number(f) : chips.relation(f)));
        if (info.facts.length && info.suggestions.length) { const l = document.createElement("div"); l.style.cssText = "width:1px;align-self:stretch;margin:3px 1px;background:#cfd0d4"; kids.push(l); }
        if (info.suggestions.length) { const seg = document.createElement("div"); seg.style.cssText = "display:flex;align-items:center;gap:5px;padding:2px;border-radius:16px;border:1px dashed #1ab8b3"; seg.append(...info.suggestions.map((b) => chips.suggestion(b))); kids.push(seg); }
        el.replaceChildren(...kids);
      }
      el.style.display = "flex";
      const r = el.getBoundingClientRect(), w = r.width, hh = r.height;
      let x = at[0] - 6, y = at[1] + 67; if (y + hh > vh - 8) y = at[1] - hh - 40;
      x = Math.max(8, Math.min(x, vw - w - 8)); y = Math.max(8, Math.min(y, vh - hh - 8));
      el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      return [x, y, x + w, y + hh];
    },
    startEdit: chips.startEdit, editing: chips.editing,
  };
}
