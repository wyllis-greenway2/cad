// The value box: while a tool or an operation runs, a box at the bottom of the screen shows its number (or the figure's sizes) and takes a typed one (`in_124`). It shows the live value
// while an arrow is dragged, and a number typed in it (or on the keyboard anywhere) is the exact value; Enter applies it. It displays what the interaction layer says.
export interface ChipField { label: string; value: string; active: boolean; typed: boolean }
export interface ChipHandlers {
  /** a field's text changed by typing in the box */
  entry(field: number, text: string): void;
  enter(): void;
  cancel(): void;
}

export function createChip(host: HTMLElement, h: ChipHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:none;align-items:center;gap:12px;background:#fff;border:1px solid #cfd0d4;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.14);padding:7px 12px;font:13px system-ui,sans-serif;color:#2b2b2d;z-index:9;white-space:nowrap";
  host.appendChild(el);
  let sig = "";
  let inputs: HTMLInputElement[] = [];
  return {
    update(fields: ChipField[] | null, unit: string) {
      if (!fields || !fields.length) { el.style.display = "none"; sig = ""; inputs = []; return; }
      const now = JSON.stringify([fields.map((f) => f.label), unit]);
      if (now !== sig) {
        sig = now;
        el.replaceChildren();
        inputs = fields.map((f, i) => {
          const row = document.createElement("label");
          row.style.cssText = "display:inline-flex;align-items:center;gap:6px";
          const label = document.createElement("span");
          label.textContent = f.label;
          const input = document.createElement("input");
          input.type = "text";
          input.inputMode = "decimal";
          input.autocomplete = "off";
          input.style.cssText = "width:78px;font:600 13px system-ui,sans-serif;text-align:right;border:1px solid #d6d7db;border-radius:7px;padding:4px 7px;outline:none;background:#fafafa";
          input.addEventListener("focus", () => input.select());
          input.addEventListener("input", () => h.entry(i, input.value));
          input.addEventListener("keydown", (ev) => {
            ev.stopPropagation(); // the keys typed here are for this box
            if (ev.key === "Enter") { ev.preventDefault(); h.enter(); input.blur(); } else if (ev.key === "Escape") { ev.preventDefault(); input.blur(); h.cancel(); }
          });
          row.append(label, input, document.createTextNode(unit));
          el.appendChild(row);
          return input;
        });
      }
      fields.forEach((f, i) => {
        const input = inputs[i]!;
        input.style.borderColor = f.active ? "#1ab8b3" : "#d6d7db";
        if (document.activeElement !== input) input.value = f.value; // what is being typed in the box is left alone
      });
      el.style.display = "flex";
    },
  };
}
