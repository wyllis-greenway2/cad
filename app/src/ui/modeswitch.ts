// The little switch by the handles of a move or a turn (`in_206`): the move arrows come with a rotate icon next to them, the turning rings with a move icon; a click changes which one is on.
import { iconSvg } from "./icons.ts";

export function createModeSwitch(host: HTMLElement, go: (to: "move" | "rotate") => void) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;width:30px;height:30px;box-sizing:border-box;padding:6px;border-radius:15px;background:#fff;border:1px solid #cfd0d4;color:#2b2b2d;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.15);z-index:8;user-select:none;-webkit-user-select:none;touch-action:manipulation";
  let to: "move" | "rotate" = "rotate";
  let shown = "";
  el.addEventListener("mouseenter", () => { el.style.borderColor = "#1ab8b3"; el.style.background = "#e8f7f6"; });
  el.addEventListener("mouseleave", () => { el.style.borderColor = "#cfd0d4"; el.style.background = "#fff"; });
  el.addEventListener("click", (e) => { e.stopPropagation(); go(to); });
  host.appendChild(el);
  return {
    /** What the switch goes to (null: hide), and the page position of the handles' middle. */
    update(what: { to: "move" | "rotate"; label: string } | null, at: [number, number] | null) {
      if (!what || !at) { el.style.display = "none"; return; }
      to = what.to;
      if (shown !== what.to) { shown = what.to; el.innerHTML = iconSvg(what.to); el.title = what.label; }
      el.style.display = "block";
      el.style.transform = `translate(${Math.round(at[0] + 40)}px, ${Math.round(at[1] - 46)}px)`;
    },
  };
}
