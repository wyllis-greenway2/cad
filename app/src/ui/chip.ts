// The value bubble (`in_124`, `in_127`): while an operation or a tool runs, a small bubble like a constraint's number sits by what it sets (the tip of the push / pull arrow, the edge, the
// middle of the handles) and takes a typed number: the amount to push or pull, the fillet or chamfer size, the angle, the distance. It shows the live value while an arrow is dragged; Enter
// applies a typed one, Esc cancels. The words are in its tooltip. It displays what the interaction layer says.
export interface ChipField { label: string; value: string; active: boolean; typed: boolean }
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
    /** `at`: the bubble's place on the page in pixels, or null for the bottom middle */
    update(fields: ChipField[] | null, unit: string, at: [number, number] | null) {
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
          input.style.cssText = "width:54px;font:600 13px system-ui,sans-serif;text-align:center;border:none;outline:none;background:transparent;padding:0";
          input.addEventListener("focus", () => input.select());
          input.addEventListener("input", () => h.entry(i, input.value));
          input.addEventListener("keydown", (ev) => {
            ev.stopPropagation(); // the keys typed here are for this bubble
            if (ev.key === "Enter") { ev.preventDefault(); h.enter(); input.blur(); } else if (ev.key === "Escape") { ev.preventDefault(); input.blur(); h.cancel(); }
          });
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
      const [x, y] = at ?? [window.innerWidth / 2, window.innerHeight - 40];
      el.style.transform = `translate(${Math.round(Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, x - el.offsetWidth / 2)))}px,${Math.round(Math.max(4, Math.min(window.innerHeight - 30, y - 34)))}px)`;
    },
  };
}
