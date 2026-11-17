// The constraint hints while a line is drawn (`in_152`): a few small round icons beside the end of the line, one for each constraint it will be made with. They only show; the click is the line's.
import { iconKey } from "./icons.ts";
import { roundButton } from "./look.ts";

export function createHints(host: HTMLElement) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;gap:4px;z-index:6;pointer-events:none";
  host.appendChild(el);
  let shown = "";
  return {
    /** The box it fills while shown (what the constraint bubbles give way to, `in_261`). */
    rect(): DOMRect | null { return el.style.display === "none" ? null : el.getBoundingClientRect(); },
    /** `kinds`: the constraints (none: hide); `at`: the page position of the end of the line. */
    update(kinds: string[], at: [number, number] | null) {
      if (!kinds.length || !at) { el.style.display = "none"; shown = ""; return; }
      const sig = kinds.join(",");
      if (sig !== shown) {
        shown = sig;
        el.replaceChildren(...kinds.map((k) => {
          return roundButton({ icon: iconKey(k), size: 26, tone: "accent" }); // (a mark, not a button: the click is the line's)
        }));
      }
      el.style.display = "flex";
      el.style.transform = `translate(${Math.round(at[0] + 16)}px, ${Math.round(at[1] + 16)}px)`;
    },
  };
}
