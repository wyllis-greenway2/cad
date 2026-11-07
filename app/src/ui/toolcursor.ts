// A little copy of the sketching tool's icon that follows the mouse pointer while the tool is on (`in_198`), so it is plain that you are in that mode. It only draws (the pointer goes through it);
// a finger has no pointer to follow (the touch cursor and the pill at the top say it there).
import { iconSvg } from "./icons.ts";

export function createToolCursor(host: HTMLElement) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;width:22px;height:22px;box-sizing:border-box;padding:3px;border-radius:11px;background:rgba(52,54,59,.92);color:#fff;pointer-events:none;z-index:9;box-shadow:0 1px 4px rgba(0,0,0,.25)";
  host.appendChild(el);
  let on = false;
  let at: [number, number] | null = null;
  const place = () => {
    el.style.display = on && at ? "block" : "none";
    if (at) el.style.transform = `translate(${Math.round(at[0] + 14)}px, ${Math.round(at[1] + 14)}px)`;
  };
  window.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.pointerType === "pen") { at = [e.clientX, e.clientY]; place(); } });
  document.addEventListener("pointerleave", () => { at = null; place(); });
  let shown = "";
  return {
    /** The tool that is on (its icon key), or null. */
    update(kind: string | null) {
      on = !!kind;
      if (kind && kind !== shown) { shown = kind; el.innerHTML = iconSvg(kind); const svg = el.firstElementChild as SVGElement | null; if (svg) { svg.setAttribute("width", "16"); svg.setAttribute("height", "16"); } }
      place();
    },
  };
}
