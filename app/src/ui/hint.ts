// The constraint hints while a line is drawn (`in_152`): a few small round icons beside the end of the line, one for each constraint it will be made with. They only show; the click is the line's.
import { iconSvg, iconKey } from "./icons.ts";

export function createHints(host: HTMLElement) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;gap:4px;z-index:6;pointer-events:none";
  host.appendChild(el);
  let shown = "";
  return {
    /** `kinds`: the constraints (none: hide); `at`: the page position of the end of the line. */
    update(kinds: string[], at: [number, number] | null) {
      if (!kinds.length || !at) { el.style.display = "none"; shown = ""; return; }
      const sig = kinds.join(",");
      if (sig !== shown) {
        shown = sig;
        el.replaceChildren(...kinds.map((k) => {
          const b = document.createElement("div");
          b.innerHTML = iconSvg(iconKey(k));
          b.style.cssText = "width:26px;height:26px;border-radius:13px;background:#fff;border:1px solid #1ab8b3;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 6px rgba(0,0,0,.18)";
          return b;
        }));
      }
      el.style.display = "flex";
      el.style.transform = `translate(${Math.round(at[0] + 16)}px, ${Math.round(at[1] + 16)}px)`;
    },
  };
}
