// The constraints next to a selection, as before (`in_058`..`in_061`): one row at the left of the selected part, an icon for each relation that touches it, and a
// number, just the number, for a dimension such as a length. Click one and it opens with an x that deletes it (and a lock, and the number can be typed over); what it ties
// the selection to shows in amber. The words are in the tooltips. A measurement that could be locked shows as a dashed number in the same row. It draws what the
// interaction layer says and reports what was pressed.
import { iconKey, iconSvg } from "./icons.ts";

export interface BadgeView {
  id: string; kind: string; label: string; dimensional: boolean; value: number | null; measured: number | null; unit: string | null;
  locked: boolean; broken: boolean; focused: boolean;
}
export interface SuggestView { label: string; value: number; unit: string }
export interface BadgeHandlers {
  focus(id: string): void; remove(id: string): void; lock(id: string): void; edit(id: string): void; measure(): void;
}
const fmt = (v: number) => String(Math.round(v * 100) / 100);
const PILL = 34; // height: a comfortable target for a finger

export function createBadges(host: HTMLElement, h: BadgeHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;display:none;flex-direction:row;align-items:center;gap:6px;z-index:8;font:13px system-ui,sans-serif;color:#2b2b2d;user-select:none;-webkit-user-select:none";
  host.appendChild(el);
  let lastKey = "";

  const pill = (inner: HTMLElement[], o: { title: string; onClick?: () => void; dashed?: boolean; focused?: boolean; broken?: boolean }) => {
    const b = document.createElement("div");
    b.title = o.title;
    b.style.cssText = `display:flex;align-items:center;gap:4px;height:${PILL}px;min-width:${PILL}px;box-sizing:border-box;padding:0 9px;justify-content:center;border-radius:${PILL / 2}px;background:#fff;border:1px ${o.dashed ? "dashed" : "solid"} ${o.broken ? "#d33" : o.focused ? "#e0a82e" : "#cfd0d4"};box-shadow:0 2px 10px rgba(0,0,0,.10);cursor:${o.onClick ? "pointer" : "default"}`;
    b.append(...inner);
    if (o.onClick) b.addEventListener("click", (e) => { e.stopPropagation(); o.onClick!(); });
    return b;
  };
  const icon = (key: string) => { const s = document.createElement("span"); s.innerHTML = iconSvg(key); s.style.cssText = "display:inline-flex"; return s; };
  const number = (v: number, bold = true) => { const s = document.createElement("span"); s.textContent = fmt(v); if (bold) s.style.fontWeight = "600"; return s; };
  const small = (key: string, title: string, on: () => void) => {
    const b = document.createElement("span");
    b.innerHTML = iconSvg(key);
    b.title = title;
    b.style.cssText = "display:inline-flex;padding:4px;border-radius:12px;cursor:pointer";
    b.addEventListener("pointerenter", () => (b.style.background = "#eef6f6"));
    b.addEventListener("pointerleave", () => (b.style.background = ""));
    b.addEventListener("click", (e) => { e.stopPropagation(); on(); });
    return b;
  };

  return {
    /** `at`: the selected part's spot on the page; the row ends just left of it. */
    update(badges: BadgeView[], suggest: SuggestView | null, at: [number, number] | null) {
      const key = JSON.stringify([badges, suggest, at && at.map(Math.round)]);
      if (key === lastKey) return;
      lastKey = key;
      if (!badges.length && !suggest) { el.style.display = "none"; return; }
      el.replaceChildren();
      for (const b of badges) {
        const value = b.dimensional ? (b.locked ? b.value : b.measured ?? b.value) : null;
        const title = `${b.label}${b.dimensional ? (b.locked ? ` ${fmt(value ?? 0)} ${b.unit ?? ""} (locked)` : " (measured only)") : ""}${b.broken ? ": a part it used is gone" : ""}`;
        // a dimension is just its number; any other relation is its icon
        const face = value !== null ? number(value) : icon(iconKey(b.kind));
        const inner: HTMLElement[] = [face];
        if (b.focused) {
          if (value !== null) {
            face.title = "Type a new number";
            face.style.cssText += ";cursor:text;border-bottom:1px dotted #999";
            face.addEventListener("click", (e) => { e.stopPropagation(); h.edit(b.id); });
            inner.push(small(b.locked ? "lock" : "dimension", b.locked ? "Locked: click to unlock (keep it as a measurement)" : "Measurement only: click to lock at this value", () => h.lock(b.id)));
          }
          inner.push(small("cross", "Delete this relation", () => h.remove(b.id)));
        }
        el.appendChild(pill(inner, { title, onClick: b.focused ? undefined : () => h.focus(b.id), focused: b.focused, broken: b.broken }));
      }
      if (suggest) el.appendChild(pill([number(suggest.value)], { title: `${suggest.label} ${fmt(suggest.value)} ${suggest.unit}: measured now. Click, or press D, to type a number and lock it`, onClick: h.measure, dashed: true }));
      el.style.display = "flex";
      const w = el.offsetWidth;
      const x = at ? at[0] - w - 14 : 12;
      const y = at ? at[1] - PILL / 2 : 12;
      el.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 6))}px`;
      el.style.top = `${Math.max(6, Math.min(y, window.innerHeight - PILL - 6))}px`;
    },
  };
}
