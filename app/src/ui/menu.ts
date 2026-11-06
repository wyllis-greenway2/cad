// The menu (a right click, a long press, the two-finger click): a short list at the pointer. It displays what the actions service says and reports which row was chosen.
export interface Row { id: string; label: string; enabled: boolean; why: string | null; group?: string }

export function createMenu(host: HTMLElement, onChoose: (id: string) => void) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;display:none;min-width:180px;background:#fff;border:1px solid #cfd0d4;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.14);padding:4px;font:14px system-ui,sans-serif;color:#2b2b2d;z-index:10;max-height:calc(100vh - 16px);overflow-y:auto;user-select:none;-webkit-user-select:none";
  host.appendChild(el);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  let rows: Row[] = [];
  return {
    show(x: number, y: number, list: Row[], extra: Row[] = []) {
      rows = [...list, ...extra];
      el.replaceChildren();
      for (const [i, r] of rows.entries()) {
        if (i > 0 && (i === list.length || (rows[i - 1]!.group ?? "") !== (r.group ?? ""))) { const hr = document.createElement("div"); hr.style.cssText = "height:1px;background:#e4e5e8;margin:4px 6px"; el.appendChild(hr); }
        const b = document.createElement("div");
        b.textContent = r.label;
        if (!r.enabled && r.why) b.title = r.why;
        b.style.cssText = `padding:11px 14px;border-radius:7px;min-height:22px;cursor:${r.enabled ? "pointer" : "default"};opacity:${r.enabled ? 1 : 0.4}`; // tap targets of about 44 px
        if (r.enabled) {
          b.addEventListener("pointerenter", () => (b.style.background = "#eef6f6"));
          b.addEventListener("pointerleave", () => (b.style.background = ""));
          b.addEventListener("pointerup", (e) => { e.stopPropagation(); onChoose(r.id); });
        }
        el.appendChild(b);
      }
      el.style.display = "block";
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
      el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 4))}px`;
    },
    hide() { el.style.display = "none"; },
    get open() { return el.style.display !== "none"; },
    element: el,
  };
}
