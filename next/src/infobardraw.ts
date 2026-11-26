// The info bar on the page (`dec_three_surfaces`, `in_1598`, `in_1601`): one row standing below its subject and a little to its left (the old app's place: 67 px under it, 6 px before it). The left of it is what is so: a constraint is a round button (a click takes
// it away), a number is a pill with its padlock (a click on the number types a new one; the padlock locks it at what it measures or lets it go; digits typed with its subject selected go to it, `startEdit`). The right, in a dashed teal outline, is what could be added (a click
// applies it). It only draws `interaction/infobar.ts`'s descriptions and says what was pressed. Words are tooltips.
import type { BarItem, Fact, Info } from "./interaction/infobar.ts";
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";

export interface InfoHandlers { suggest(id: string): void; /** a fact that is a constraint was clicked */ fact(id: string): void; /** a number was typed over (the solver's value: a diameter typed is already a radius) */ set(id: string, value: number): void; /** a padlock was clicked */ lock(id: string): void }
const EDGE = { free: "#d6d7db", holds: "#3fae6a" } as const, TONE = { rest: "#d6d7db", refused: "#e46a6a", applied: "#3fae6a", offer: "#f2c14e" } as const;

export function createInfoBar(host: HTMLElement) {
  const el = document.createElement("div"); el.dataset.info = "";
  el.style.cssText = `position:fixed;left:0;top:0;display:none;z-index:8;align-items:center;gap:6px;padding:4px;border-radius:18px;background:rgba(255,255,255,.92);border:1px solid #1ab8b3;box-shadow:0 1px 6px rgba(0,0,0,.12);font:12px ${settings.ui.font};color:${settings.ui.text};user-select:none;-webkit-user-select:none`;
  for (const t of ["pointerdown", "click", "contextmenu"]) el.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu") e.preventDefault(); });
  host.appendChild(el);
  let sig = "", editing = false, on: InfoHandlers | null = null; const numbers = new Map<string, { fact: Fact; span: HTMLElement }>();
  /** what a number typed over a fact is, as the solver's value (a diameter typed is half of it; an angle typed inside the corner is the directed angle the solver reads, kept within a half turn either way) */
  const valueOf = (f: Fact, typed: number): number => { if (!f.input) return typed; const v = f.input.mul * typed + f.input.add; if (f.unit !== "deg") return v; let r = ((v % 360) + 360) % 360; if (r > 180) r -= 360; return r; };
  function edit(f: Fact, span: HTMLElement, initial?: string): void {
    const input = document.createElement("input"), start = initial ?? f.text ?? "";
    input.value = start; input.style.cssText = `width:${Math.max(4, start.length + 3)}ch;font:inherit;font-weight:600;border:0;outline:0;background:transparent;padding:0`;
    span.replaceWith(input); input.focus(); if (initial === undefined) input.select(); else input.setSelectionRange(input.value.length, input.value.length); editing = true;
    const done = (commit: boolean) => { if (!editing) return; editing = false; const v = Number(input.value.trim()); if (commit && input.value.trim() !== "" && isFinite(v)) on?.set(f.id, valueOf(f, v)); sig = ""; };
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") done(true); else if (e.key === "Escape") done(false); });
    input.addEventListener("blur", () => done(false)); input.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  const relation = (f: Fact): HTMLElement => {
    const d = document.createElement("div"); d.dataset.fact = f.id; d.title = `${f.title} (click to take it away)`; d.innerHTML = iconSvg(f.icon);
    d.style.cssText = `box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#fff;border:1.5px solid ${TONE[f.tone]};cursor:pointer`;
    d.addEventListener("click", () => on?.fact(f.id)); return d;
  };
  const number = (f: Fact): HTMLElement => {
    const d = document.createElement("div"); d.dataset.fact = f.id; d.title = f.title;
    d.style.cssText = `box-sizing:border-box;display:flex;align-items:center;gap:4px;height:28px;padding:0 9px;border-radius:14px;background:#fff;border:1.5px solid ${TONE[f.tone]}`;
    if (f.symbol && f.symbol !== "°") { const s = document.createElement("span"); s.textContent = f.symbol; s.style.cssText = "font-weight:600;opacity:.6"; d.append(s); }
    const num = document.createElement("span"); num.textContent = f.text ?? ""; num.dataset.number = f.id; num.style.cssText = `font-weight:600;${f.readonly ? "" : "cursor:text;"}${f.active ? "text-decoration:underline;text-underline-offset:3px;" : ""}${f.locked === false ? "opacity:.8;" : ""}`;
    if (!f.readonly) num.addEventListener("click", () => edit(f, num)); numbers.set(f.id, { fact: f, span: num }); d.append(num);
    if (f.symbol === "°") { const s = document.createElement("span"); s.textContent = "°"; s.style.cssText = "font-weight:600;opacity:.6;margin-left:-3px"; d.append(s); }
    if (f.locked !== undefined) { // the padlock: closed when the number is a constraint (or typed), open when it is only measured
      const l = document.createElement("span"); l.innerHTML = iconSvg(f.locked ? "lock" : "unlock"); l.dataset.padlock = f.locked ? "closed" : "open"; l.title = f.readonly ? (f.locked ? "typed" : "measured") : f.locked ? "Locked: click to let it go" : "Measured: click to lock it at this number";
      l.style.cssText = `display:flex;${f.readonly ? "" : "cursor:pointer;"}opacity:${f.locked ? 1 : 0.6};color:${f.locked ? "#1ab8b3" : "inherit"}`; if (!f.readonly) l.addEventListener("click", () => on?.lock(f.id)); d.append(l);
    }
    return d;
  };
  const suggestion = (b: BarItem): HTMLElement => {
    const d = document.createElement("div"), svg = iconSvg(b.icon); d.title = b.label; d.dataset.bar = b.id; d.innerHTML = svg || `<span style="font-weight:600">${b.label.slice(0, 2)}</span>`;
    d.style.cssText = `box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#fff;border:1.5px solid ${EDGE[b.tone]};cursor:pointer`;
    d.addEventListener("pointerenter", () => { d.style.background = "#e8f7f6"; d.style.borderColor = "#1ab8b3"; }); d.addEventListener("pointerleave", () => { d.style.background = "#fff"; d.style.borderColor = EDGE[b.tone]; });
    d.addEventListener("click", () => on?.suggest(b.id)); return d;
  };
  return {
    /** Each picture: what the bar says (null: no bar), where on the page it stands from, and what its buttons do. Returns the box it takes. */
    show(info: Info | null, at: [number, number] | null, h: InfoHandlers | null, vw: number, vh: number): [number, number, number, number] | null {
      if (h) on = h; // (kept while a number is being typed, when the subject is not asked for)
      if (!info || !at || (!info.facts.length && !info.suggestions.length)) { if (!editing) { el.style.display = "none"; sig = ""; } return null; }
      const s = JSON.stringify(info);
      if (s !== sig && !editing) {
        sig = s; numbers.clear(); const kids: HTMLElement[] = info.facts.map((f) => (f.kind === "dimension" ? number(f) : relation(f)));
        if (info.facts.length && info.suggestions.length) { const l = document.createElement("div"); l.style.cssText = "width:1px;align-self:stretch;margin:3px 1px;background:#cfd0d4"; kids.push(l); }
        if (info.suggestions.length) { const seg = document.createElement("div"); seg.style.cssText = "display:flex;align-items:center;gap:5px;padding:2px;border-radius:16px;border:1px dashed #1ab8b3"; seg.append(...info.suggestions.map(suggestion)); kids.push(seg); }
        el.replaceChildren(...kids);
      }
      el.style.display = "flex";
      const r = el.getBoundingClientRect(), w = r.width, hh = r.height;
      let x = at[0] - 6, y = at[1] + 67; if (y + hh > vh - 8) y = at[1] - hh - 40;
      x = Math.max(8, Math.min(x, vw - w - 8)); y = Math.max(8, Math.min(y, vh - hh - 8));
      el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      return [x, y, x + w, y + hh];
    },
    /** digits typed with the subject selected go to its number: the text starts as the key typed; false: there is no such number */
    startEdit(id: string, initial: string): boolean { const n = numbers.get(id); if (!n || editing || n.fact.readonly || !n.span.isConnected) return false; edit(n.fact, n.span, initial); return true; },
    editing: (): boolean => editing,
  };
}
