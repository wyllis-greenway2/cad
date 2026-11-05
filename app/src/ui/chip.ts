// The value bubble (`in_124`, `in_127`): while an operation or a tool runs, a small bubble like a constraint's number sits by what it sets (the tip of the push / pull arrow, the edge, the
// middle of the handles) and takes a typed number: the amount to push or pull, the fillet or chamfer size, the angle, the distance. It shows the live value while an arrow is dragged; Enter
// applies a typed one, Esc cancels. The words are in its tooltip. It displays what the interaction layer says.
export interface ChipField { label: string; value: string; active: boolean; typed: boolean; short?: string }
export interface ChipHandlers {
  /** a field's text changed by typing in the bubble */
  entry(field: number, text: string): void;
  enter(): void;
  cancel(): void;
}

export function createChip(host: HTMLElement, h: ChipHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;align-items:center;gap:4px;height:26px;box-sizing:border-box;padding:0 6px;border-radius:13px;background:#fff;border:1px solid #d6d7db;box-shadow:0 1px 6px rgba(0,0,0,.12);font:13px system-ui,sans-serif;color:#2b2b2d;z-index:9;white-space:nowrap";
  host.appendChild(el);
  let sig = "";
  let inputs: HTMLInputElement[] = [];
  return {
    /** `at`: what the bubble is by, in pixels (null: the bottom middle); `from`: the other end of the arrow `at` is the tip of, so the bubble stands out past the tip */
    update(fields: ChipField[] | null, unit: string, at: [number, number] | null, from: [number, number] | null = null) {
      if (!fields || !fields.length) { el.style.display = "none"; sig = ""; inputs = []; return; }
      const now = JSON.stringify([fields.map((f) => f.label), unit]);
      if (now !== sig) {
        sig = now;
        el.replaceChildren();
        inputs = fields.map((f, i) => {
          const input = document.createElement("input");
          input.type = "text";
          input.inputMode = "decimal";
          input.autocomplete = "off";
          input.title = `${f.label} (${unit}): type a number and press Enter`;
          input.style.cssText = `width:${fields.length > 1 ? 46 : 54}px;font:600 13px system-ui,sans-serif;text-align:center;border:none;outline:none;background:transparent;padding:0`;
          input.addEventListener("focus", () => input.select());
          input.addEventListener("input", () => h.entry(i, input.value));
          input.addEventListener("keydown", (ev) => {
            ev.stopPropagation(); // the keys typed here are for this bubble
            if (ev.key === "Enter") { ev.preventDefault(); h.enter(); input.blur(); } else if (ev.key === "Escape") { ev.preventDefault(); input.blur(); h.cancel(); }
          });
          if (f.short) { const tag = document.createElement("span"); tag.textContent = f.short; tag.style.cssText = "font-weight:700;opacity:.6"; el.appendChild(tag); }
          el.appendChild(input);
          return input;
        });
      }
      fields.forEach((f, i) => {
        const input = inputs[i]!;
        input.style.textDecoration = f.active && fields.length > 1 ? "underline #1ab8b3" : "none";
        if (document.activeElement !== input) input.value = f.value; // what is being typed in the bubble is left alone
      });
      el.style.display = "flex";
      const w = el.offsetWidth;
      const hgt = el.offsetHeight;
      let [x, y] = at ?? [window.innerWidth / 2, window.innerHeight - 40];
      if (at) {
        // out past the tip of the arrow, away from its other end (to the right when there is no direction), so it never sits on the arrow
        let [ux, uy] = from ? [at[0] - from[0], at[1] - from[1]] : [0, 0];
        const l = Math.hypot(ux, uy);
        if (l < 6) [ux, uy] = [1, 0]; else [ux, uy] = [ux / l, uy / l];
        x += ux * (w / 2 + 18);
        y += uy * (hgt / 2 + 18);
      }
      el.style.transform = `translate(${Math.round(Math.max(4, Math.min(window.innerWidth - w - 4, x - w / 2)))}px,${Math.round(Math.max(4, Math.min(window.innerHeight - hgt - 4, y - hgt / 2)))}px)`;
    },
  };
}
