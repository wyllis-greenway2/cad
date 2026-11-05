// The badges next to a selection: an icon for each relation that touches it (with its number and a lock for a dimension). Click one and it opens with an x that
// deletes it and its other parts show in amber (`in_061`). Icons carry the meaning; the words are in the tooltip (`in_058`). It draws what the interaction layer says
// and reports what was pressed.
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

export function createBadges(host: HTMLElement, h: BadgeHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;display:none;flex-direction:column;gap:6px;z-index:8;font:13px system-ui,sans-serif;color:#2b2b2d;user-select:none;-webkit-user-select:none";
  host.appendChild(el);
  let lastKey = "";
  const pill = (inner: (HTMLElement | string)[], opts: { title: string; onClick?: () => void; dashed?: boolean; focused?: boolean; broken?: boolean }) => {
    const b = document.createElement("div");
    b.title = opts.title;
    b.style.cssText = `display:flex;align-items:center;gap:6px;min-height:34px;box-sizing:border-box;padding:4px 10px;border-radius:17px;background:#fff;border:1px ${opts.dashed ? "dashed" : "solid"} ${opts.broken ? "#d33" : opts.focused ? "#e0a82e" : "#cfd0d4"};box-shadow:0 2px 10px rgba(0,0,0,.10);cursor:${opts.onClick ? "pointer" : "default"}`;
    b.append(...inner);
    if (opts.onClick) b.addEventListener("click", (e) => { e.stopPropagation(); opts.onClick!(); });
    return b;
  };
  const icon = (key: string) => { const s = document.createElement("span"); s.innerHTML = iconSvg(key); s.style.cssText = "display:inline-flex"; return s; };
  const text = (t: string, bold = false) => { const s = document.createElement("span"); s.textContent = t; if (bold) s.style.fontWeight = "600"; return s; };
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
    update(badges: BadgeView[], suggest: SuggestView | null, at: [number, number] | null) {
      const key = JSON.stringify([badges, suggest, at && at.map(Math.round)]);
      if (key === lastKey) return;
      lastKey = key;
      if (!badges.length && !suggest) { el.style.display = "none"; return; }
      el.replaceChildren();
      for (const b of badges) {
        const ic = icon(iconKey(b.kind));
        const title = `${b.label}${b.dimensional ? (b.locked ? " (locked)" : " (measured only)") : ""}${b.broken ? ": a part it used is gone" : ""}`;
        const value = b.dimensional ? (b.locked ? b.value : b.measured ?? b.value) : null;
        const parts: (HTMLElement | string)[] = [ic];
        if (b.focused) parts.push(text(b.label));
        if (value !== null) {
          const v = text(`${fmt(value)} ${b.unit ?? ""}`, true);
          v.style.cssText += ";cursor:text;border-bottom:1px dotted #999";
          v.title = "Change the number";
          v.addEventListener("click", (e) => { e.stopPropagation(); h.edit(b.id); });
          parts.push(v);
          parts.push(small(b.locked ? "lock" : "dimension", b.locked ? "Locked: click to unlock (keep it as a measurement)" : "Measurement only: click to lock at this value", () => h.lock(b.id)));
        }
        if (b.focused) parts.push(small("cross", "Delete this relation", () => h.remove(b.id)));
        el.appendChild(pill(parts, { title, onClick: () => h.focus(b.id), focused: b.focused, broken: b.broken }));
      }
      if (suggest) el.appendChild(pill([icon("dimension"), text(`${suggest.label} ${fmt(suggest.value)} ${suggest.unit}`)], { title: "Measured now: click, or press D, to type a number and lock it", onClick: h.measure, dashed: true }));
      el.style.display = "flex";
      const x = at ? at[0] + 16 : window.innerWidth - el.offsetWidth - 12;
      const y = at ? at[1] - 16 : 12;
      el.style.left = `${Math.max(6, Math.min(x, window.innerWidth - el.offsetWidth - 6))}px`;
      el.style.top = `${Math.max(6, Math.min(y, window.innerHeight - el.offsetHeight - 6))}px`;
    },
  };
}
