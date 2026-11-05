// The number chip: shows the figure's sizes (or the operation's number) next to the pointer while a tool or an operation runs. It displays what the interaction layer says.
export interface ChipField { label: string; value: string; active: boolean; typed: boolean }

export function createChip(host: HTMLElement) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;display:none;pointer-events:none;background:#fff;border:1px solid #cfd0d4;border-radius:9px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:6px 10px;font:13px system-ui,sans-serif;color:#2b2b2d;z-index:9;white-space:nowrap;user-select:none";
  host.appendChild(el);
  return {
    update(fields: ChipField[] | null, unit: string, x: number, y: number) {
      if (!fields || !fields.length) { el.style.display = "none"; return; }
      el.replaceChildren(...fields.map((f) => {
        const row = document.createElement("span");
        row.style.cssText = `margin-right:10px;${f.active ? "font-weight:600" : "opacity:.7"}`;
        const label = document.createElement("span");
        label.textContent = `${f.label} `;
        const val = document.createElement("span");
        val.textContent = f.value === "" ? "…" : f.value;
        val.style.cssText = f.typed ? "border-bottom:2px solid #1ab8b3" : "";
        row.append(label, val, document.createTextNode(` ${unit}`));
        return row;
      }));
      el.style.display = "block";
      el.style.left = `${Math.min(x + 16, window.innerWidth - el.offsetWidth - 6)}px`;
      el.style.top = `${Math.min(y + 18, window.innerHeight - el.offsetHeight - 6)}px`;
    },
  };
}
