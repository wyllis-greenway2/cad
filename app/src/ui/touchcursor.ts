// The handle of the touch cursor (`in_160`): a finger has no hover, so while a figure is being drawn there is a cursor (the line follows it, with its guides and hints) and a round handle
// beside it to drag it about; a tap on the handle sets the point. It only draws; the touches go to the page's input as usual (it lets them through).
import { iconSvg } from "./icons.ts";

export function createTouchCursor(host: HTMLElement) {
  const el = document.createElement("div");
  el.innerHTML = iconSvg("move");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;width:44px;height:44px;box-sizing:border-box;border-radius:22px;background:#fff;border:2px solid #1ab8b3;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.2);pointer-events:none;z-index:6";
  host.appendChild(el);
  return {
    /** `at`: the page position of the centre of the handle (null: hide). */
    update(at: [number, number] | null) {
      if (!at) { el.style.display = "none"; return; }
      el.style.display = "flex";
      el.style.transform = `translate(${Math.round(at[0] - 22)}px, ${Math.round(at[1] - 22)}px)`;
    },
  };
}
