// The list card opened from the ⋯ menu (`in_132`): the bodies with their names, or the history of steps. It displays what the interaction layer says and reports which row was chosen.
import { iconSvg } from "./icons.ts";

export interface PanelData { kind: string; title: string; rows: { id: string; label: string; active: boolean; removable: boolean }[] }
export interface PanelHandlers { row(id: string, act: "select" | "remove"): void; undo(): void; redo(): void; close(): void }

export function createPanel(host: HTMLElement, h: PanelHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:14px;top:14px;display:none;min-width:200px;max-width:280px;max-height:60vh;overflow:auto;background:#fff;border:1px solid #cfd0d4;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.14);padding:6px;font:13px system-ui,sans-serif;color:#2b2b2d;z-index:9;user-select:none;-webkit-user-select:none";
  host.appendChild(el);
  let sig = "";
  const btn = (text: string, title: string, on: () => void): HTMLElement => {
    const b = document.createElement("div");
    b.innerHTML = text;
    b.title = title;
    b.style.cssText = "display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:7px;cursor:pointer";
    b.addEventListener("pointerenter", () => (b.style.background = "#eef6f6"));
    b.addEventListener("pointerleave", () => (b.style.background = ""));
    b.addEventListener("click", (e) => { e.stopPropagation(); on(); });
    return b;
  };
  return {
    update(p: PanelData | null) {
      if (!p) { el.style.display = "none"; sig = ""; return; }
      const now = JSON.stringify(p);
      if (now === sig) return;
      sig = now;
      el.replaceChildren();
      const head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;gap:4px;padding:2px 4px 6px";
      const title = document.createElement("span");
      title.textContent = p.title;
      title.style.cssText = "font-weight:600;flex:1";
      head.appendChild(title);
      if (p.kind === "history") { head.appendChild(btn("↶", "Undo", h.undo)); head.appendChild(btn("↷", "Redo", h.redo)); }
      head.appendChild(btn(iconSvg("cross"), "Close", h.close));
      el.appendChild(head);
      for (const r of p.rows) {
        const row = document.createElement("div");
        row.style.cssText = `display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;cursor:${p.kind === "bodies" ? "pointer" : "default"};background:${r.active ? "#dff1f0" : ""}`;
        const label = document.createElement("span");
        label.textContent = r.label;
        label.style.flex = "1";
        row.appendChild(label);
        if (r.removable) row.appendChild(btn(iconSvg("cross"), "Take this step out", () => h.row(r.id, "remove")));
        if (p.kind === "bodies") row.addEventListener("click", () => h.row(r.id, "select"));
        el.appendChild(row);
      }
      if (!p.rows.length) { const none = document.createElement("div"); none.textContent = "—"; none.style.cssText = "padding:6px 8px;opacity:.5"; el.appendChild(none); }
      el.style.display = "block";
    },
  };
}
